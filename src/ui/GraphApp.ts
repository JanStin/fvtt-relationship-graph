/**
 * ApplicationV2-оболочка для графа (подход проверен спайком S4, docs/architecture.md). Поток данных:
 * storage.loadGraphData() -> actors.syncNodesWithActors() -> graph-renderer.renderGraph()
 * -> interaction.setupInteraction() (мышь/клавиши, см. interaction.ts и docs/controls.md).
 * Контекстное меню и карточку информации (overlays.ts) наполняет этот класс.
 *
 * Совместная работа: граф открывается в режиме просмотра. Кнопка
 * «Редактировать» берёт блокировку (foundry/edit-lock.ts) — редактор один на всех. Каждое его
 * сохранение приходит остальным хуком updateJournalEntry, и их граф перерисовывается с
 * сохранением вида, выделения, карточки и открытого списка.
 */

import type cytoscape from "cytoscape";
import { t, tn } from "../core/i18n";
import type { GraphData, GraphEdge, GraphNode } from "../core/model";
import { syncNodesWithActors } from "../foundry/actors";
import { acquireEditLock, currentEditor, LOCK_FLAG_KEY, releaseEditLock, userName } from "../foundry/edit-lock";
import {
  allowPlayersToSave,
  FLAG_SCOPE,
  GRAPH_FLAG_KEY,
  isStorageEntry,
  loadGraphData,
  saveGraphData,
} from "../foundry/storage";
import {
  backgroundFromEdit,
  graphFontFamily,
  SYSTEM_FONTS,
  coverVisibleArea,
  DEFAULT_BACKGROUND_COLOR,
  setBackground,
  type BackgroundEditValues,
} from "../core/background";
import {
  allConditions,
  conditionLabel,
  createCondition,
  removeCondition,
  updateCondition,
  type ConditionEditValues,
} from "../core/conditions";
import { describeEdge, describeFaction, describeNode } from "../core/describe";
import {
  applyEdgeEdit,
  applyFactionEdit,
  applyNodeEdit,
  blankEdge,
  blankNode,
  createFactionFromEdit,
  factionName,
  isBlankEdge,
  type FactionEditValues,
} from "../core/edit";
import { addEdge, addNode, removeEdge, removeElements, removeFaction, removeNode } from "../core/graph-state";
import { GraphHistory } from "../core/history";
import { exportFileName, exportGraphFile } from "../import/native";
import { clientToModel, type Point } from "../core/hit-test";
import {
  createRelationshipType,
  ensureDefaultRelationshipTypes,
  relationshipTypeLabel,
  removeRelationshipType,
  updateRelationshipType,
  type RelationshipTypeEditValues,
} from "../core/relationship-types";
import {
  canEditNode,
  planDeletion,
  restrictFactionEdit,
  restrictNodeEdit,
  visibleEdgeCount,
} from "../core/permissions";
import { displayName, isMasked, nodeName } from "../core/visibility";
import { createBackgroundLayer, type BackgroundLayer } from "./background-layer";
import { setupEdgeLabels, type EdgeLabelsHandle } from "./edge-labels";
import { createFactionBlobLayer, type FactionBlobLayer } from "./faction-blobs";
import { renderGraph } from "./graph-renderer";
import { setupInteraction, type GraphTarget, type InteractionHandle, type NodeSnapshot } from "./interaction";
import { startIdleTimer, type IdleTimer } from "./idle-timer";
import { createNodeDecorLayer, type NodeDecorLayer } from "./node-decor";
import { createOverlays, type MenuItem, type Overlays } from "./overlays";
import { createZoomControl, type ZoomControl } from "./zoom-control";
import { createBackgroundPanel } from "./panels/BackgroundPanel";
import { createConditionListPanel, createConditionPanel } from "./panels/ConditionPanel";
import { createEdgePanel } from "./panels/EdgePanel";
import { createFactionListPanel, createFactionPanel } from "./panels/FactionPanel";
import { iconButton } from "./panels/form";
import { createImportControl, type ImportControl } from "./panels/ImportDialog";
import { createNodePanel, type ActorOption } from "./panels/NodePanel";
import { createRelationshipTypeListPanel, createRelationshipTypePanel } from "./panels/RelationshipTypePanel";

declare const foundry: any;
declare const game: any;
declare const ui: any;
declare const Hooks: any;
declare const CONFIG: any;

/** Через сколько минут полного бездействия редактор выходит из режима. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const EMPTY_GRAPH: GraphData = ensureDefaultRelationshipTypes({
  nodes: [],
  edges: [],
  factions: [],
  relationshipTypes: [],
  conditions: [],
});

const ApplicationV2 = foundry.applications.api.ApplicationV2;

/**
 * Шрифты, которые Foundry уже загрузил для всех клиентов: встроенные и добавленные в настройках
 * мира («Дополнительные шрифты»).
 */
function foundryFonts(): string[] {
  const fontConfig = foundry.applications?.settings?.menus?.FontConfig;
  const names: unknown = fontConfig?.getAvailableFonts?.() ?? Object.keys(CONFIG.fontDefinitions ?? {});
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
}

export class GraphApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fvtt-relationship-graph-app",
    window: {
      // ApplicationV2 сам переводит заголовок окна через game.i18n.localize.
      title: "RELGRAPH.Title",
      resizable: true,
      icon: "fa-solid fa-diagram-project",
    },
    position: {
      width: 1000,
      height: 700,
    },
  };

  #cy: cytoscape.Core | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #interaction: InteractionHandle | null = null;
  #overlays: Overlays | null = null;
  #decor: NodeDecorLayer | null = null;
  #edgeLabels: EdgeLabelsHandle | null = null;
  #zoomControl: ZoomControl | null = null;
  #background: BackgroundLayer | null = null;
  #factionBlobs: FactionBlobLayer | null = null;
  /** Открытая боковая панель (узел, связь, списки) — максимум одна. */
  #panel: HTMLElement | null = null;
  /** Как заново открыть текущую панель после перерисовки чужим изменением (только списки). */
  #reopenPanel: (() => void) | null = null;
  /** Последняя открытая карточка информации — чтобы обновить её после чужого изменения. */
  #lastInfo: { target: GraphTarget; client: Point } | null = null;
  #cyHost: HTMLElement | null = null;
  /** Актуальный полный граф (с синхронизированными актёрами) — источник для персиста позиций/scale. */
  #currentData: GraphData | null = null;

  /** Режим редактирования: этот клиент держит блокировку. */
  #editing = false;
  #idleTimer: IdleTimer | null = null;
  #editButton: HTMLButtonElement | null = null;
  #undoButton: HTMLButtonElement | null = null;
  #redoButton: HTMLButtonElement | null = null;
  #backgroundButton: HTMLButtonElement | null = null;
  #importControl: ImportControl | null = null;
  /** История отмены/повтора — только на время сеанса редактирования. */
  #history = new GraphHistory();
  /** Следующее сохранение позиций — часть предыдущего шага истории (см. #settle). */
  #mergeNextStep = false;
  /** Зарегистрированные хуки Foundry — снимаются в close(). */
  #hooks: Array<[string, number]> = [];

  async _renderHTML(): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    // position:relative — контекстное меню/карточка информации позиционируются внутри wrapper.
    wrapper.style.cssText = "position:relative;width:100%;height:100%;display:flex;flex-direction:column;";

    const toolbar = document.createElement("div");
    toolbar.className = "frg-toolbar";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.addEventListener("click", () => {
      void this.#toggleEditing();
    });
    this.#editButton = editButton;
    toolbar.append(editButton);

    const group = (...buttons: HTMLElement[]) => {
      const element = document.createElement("span");
      element.className = "frg-toolbar-group";
      element.append(...buttons);
      return element;
    };
    const button = (icon: string, title: string, onClick: () => void) => {
      const element = iconButton(icon, title);
      element.addEventListener("click", onClick);
      return element;
    };

    // Отмена/повтор — доступны в режиме редактирования, когда есть что отменять/повторять.
    this.#undoButton = button("fa-rotate-left", t("RELGRAPH.Graph.Undo"), () => void this.#undo());
    this.#redoButton = button("fa-rotate-right", t("RELGRAPH.Graph.Redo"), () => void this.#redo());
    toolbar.append(group(this.#undoButton, this.#redoButton));

    // Справочники — всем и в любом режиме; что в них можно менять, решают сами списки.
    toolbar.append(
      group(
        button("fa-flag", t("RELGRAPH.Common.Factions"), () => this.#openFactionList()),
        button("fa-share-nodes", t("RELGRAPH.Common.RelationshipTypes"), () => this.#openRelationshipTypeList()),
        button("fa-tags", t("RELGRAPH.Common.Conditions"), () => this.#openConditionList()),
      ),
    );

    // Фон графа — только GM и только в режиме редактирования; видят его все.
    if (this.#isGM) {
      this.#backgroundButton = button("fa-image", t("RELGRAPH.Background.Panel"), () => this.#openBackgroundPanel());
      toolbar.append(group(this.#backgroundButton));
    }

    // Импорт и экспорт — только GM, справа. Импорт — только в режиме редактирования.
    if (this.#isGM) {
      this.#importControl = createImportControl({
        onImported: (data) => {
          void this.#importAndDisplay(data);
        },
        onExport: () => this.#exportToFile(),
      });
      this.#importControl.element.classList.add("frg-toolbar-end");
      toolbar.append(this.#importControl.element);
    }
    this.#updateToolbar();

    const cyHost = document.createElement("div");
    // position/overflow — для слоя декора узлов (node-decor.ts), он живёт внутри cyHost.
    cyHost.style.cssText = `position:relative;overflow:hidden;flex:1 1 auto;min-height:0;background:${DEFAULT_BACKGROUND_COLOR};`;

    // ползунок масштаба — в wrapper поверх правого нижнего угла графа (см. zoom-control.ts)
    this.#zoomControl?.destroy();
    this.#zoomControl = createZoomControl();

    wrapper.append(toolbar, cyHost, this.#zoomControl.element);
    (wrapper as unknown as { _cyHost: HTMLElement })._cyHost = cyHost;
    return wrapper;
  }

  async _replaceHTML(result: HTMLElement, content: HTMLElement): Promise<void> {
    content.replaceChildren(result);
    this.#cyHost = (result as unknown as { _cyHost: HTMLElement })._cyHost;
    this.#registerHooks();

    // Ждём кадр, чтобы элемент реально встроился в DOM окна до того, как
    // Cytoscape попытается измерить его размеры (см. находки S4).
    requestAnimationFrame(() => {
      this.#loadAndDisplay().catch((err: unknown) => {
        console.error("fvtt-relationship-graph | GraphApp mount failed", err);
      });
    });
  }

  async #loadAndDisplay(): Promise<void> {
    // Игроки создают и правят связи — им нужно право записи в журнал-хранилище.
    if (this.#isGM) {
      await allowPlayersToSave().catch((err: unknown) => {
        console.warn("fvtt-relationship-graph | could not open storage to players", err);
      });
    }
    const stored = await loadGraphData();
    this.#display(stored ?? EMPTY_GRAPH);
  }

  // Уведомления/логирование warnings — ответственность ImportDialog (createImportControl),
  // здесь только персист + перерисовка уже распарсенных данных.
  async #importAndDisplay(data: GraphData): Promise<void> {
    if (!this.#editing || !this.#isGM) return;
    // шаг истории, как любая правка: импорт отменяется Ctrl+Z
    await this.#commit(data);
    this.#cy?.fit(undefined, 30);
  }

  /**
   * Экспорт в собственный формат: граф целиком, со скрытыми данными — кнопка есть
   * только у GM. Работает и в режиме просмотра.
   */
  #exportToFile(): void {
    if (!this.#isGM || !this.#currentData) return;
    const now = new Date();
    const json = JSON.stringify(exportGraphFile(this.#currentData, now), null, 2);
    foundry.utils.saveDataToFile(json, "application/json", exportFileName(now));
  }

  // ---------------------------------------------------------------------------------------
  // Отмена/повтор и удаление по Delete

  async #undo(): Promise<void> {
    if (!this.#editing || !this.#currentData) return;
    const previous = this.#history.undo(this.#currentData);
    if (previous) await this.#commit(previous, { record: false });
  }

  async #redo(): Promise<void> {
    if (!this.#editing || !this.#currentData) return;
    const next = this.#history.redo(this.#currentData);
    if (next) await this.#commit(next, { record: false });
  }

  /** Delete по выделению: всё разом, одним подтверждением и одним шагом истории. */
  async #deleteSelected(nodeIds: string[], edgeIds: string[]): Promise<void> {
    const data = this.#currentData;
    if (!this.#editing || !data) return;
    const plan = planDeletion(data, nodeIds, edgeIds, this.#isGM);
    if (plan.nodeIds.length === 0 && plan.edgeIds.length === 0) return;

    const nodes = plan.nodeIds.length > 0 ? tn("RELGRAPH.Common.Nodes", plan.nodeIds.length) : "";
    const edges = plan.visibleEdgeCount > 0 ? tn("RELGRAPH.Common.Edges", plan.visibleEdgeCount) : "";
    const question =
      nodes && edges
        ? t("RELGRAPH.Graph.DeleteSelectedBoth", { nodes, edges })
        : t("RELGRAPH.Graph.DeleteSelectedOne", { items: nodes || edges });
    const skipped = nodeIds.length - plan.nodeIds.length;
    const note = skipped > 0 ? ` ${t("RELGRAPH.Graph.DeleteSelectedGmOnlyNote", { count: skipped })}` : "";
    const confirmed = await this.#confirm(t("RELGRAPH.Graph.DeleteSelected"), question + note);
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeElements(this.#currentData, plan.nodeIds, plan.edgeIds));
  }

  /**
   * Раздвигает соседей узла после правки/создания. Сдвиги позиций сохраняются, но в историю
   * идут тем же шагом, что и сама правка: одна отмена возвращает и то и другое.
   */
  #settle(nodeId: string): void {
    this.#mergeNextStep = true;
    try {
      this.#interaction?.settle(nodeId); // синхронно вызывает onNodesChanged → #persistNodeChanges
    } finally {
      this.#mergeNextStep = false;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Совместная работа

  #registerHooks(): void {
    if (this.#hooks.length > 0) return;
    const on = (name: string, fn: (...args: any[]) => void) => this.#hooks.push([name, Hooks.on(name, fn)]);
    on("updateJournalEntry", (entry: unknown, changes: any, _options: unknown, userId: string) =>
      this.#onStorageUpdated(entry, changes, userId),
    );
    // держатель блокировки вышел из мира — кнопка у остальных снова доступна
    on("userConnected", () => this.#updateToolbar());
  }

  #onStorageUpdated(entry: unknown, changes: any, userId: string): void {
    if (!isStorageEntry(entry as { name?: string })) return;
    const flags = changes?.flags?.[FLAG_SCOPE];
    if (!flags) return;

    if (LOCK_FLAG_KEY in flags) this.#onLockChanged();
    // Свои сохранения уже на экране (#commit перерисовал), чужие — перечитываем.
    if (GRAPH_FLAG_KEY in flags && userId !== game.user?.id) {
      void this.#reloadFromStorage().catch((err: unknown) => {
        console.error("fvtt-relationship-graph | live update failed", err);
      });
    }
  }

  /** Блокировка сменила владельца. Если мы редактировали, а держатель теперь другой — мы проиграли гонку. */
  #onLockChanged(): void {
    const editor = currentEditor();
    if (this.#editing && editor !== game.user?.id) {
      this.#setEditing(false);
      ui.notifications?.warn(
        editor ? t("RELGRAPH.Graph.LockedBy", { user: userName(editor) }) : t("RELGRAPH.Graph.EditingReleased"),
      );
      if (this.#currentData) this.#display(this.#currentData, true);
    }
    this.#updateToolbar();
  }

  /** Чужое изменение графа: перерисовка без потери вида, выделения, карточки и открытого списка. */
  async #reloadFromStorage(): Promise<void> {
    const data = await loadGraphData();
    if (!data || !this.#cy) return;

    const selectedIds = this.#cy.$(":selected").map((el) => el.id());
    const reopen = this.#reopenPanel;
    const info = this.#overlays?.isInfoOpen() ? this.#lastInfo : null;

    this.#display(data, true);

    const cy = this.#cy as cytoscape.Core | null;
    selectedIds.forEach((id) => cy?.getElementById(id).select());
    reopen?.();
    // карточка по удалённому элементу не откроется (describe* вернёт null)
    if (info) this.#openInfo(info.target, info.client);
  }

  async #toggleEditing(): Promise<void> {
    const userId: string | undefined = game.user?.id;
    if (!userId) return;
    if (this.#editing) {
      await this.#stopEditing();
      return;
    }

    let acquired = false;
    try {
      acquired = await acquireEditLock(userId);
    } catch (err) {
      console.error("fvtt-relationship-graph | edit lock failed", err);
      ui.notifications?.error(t("RELGRAPH.Graph.EditingFailed"));
      return;
    }
    if (!acquired) {
      const editor = currentEditor();
      ui.notifications?.warn(t("RELGRAPH.Graph.BusyBy", { user: editor ? userName(editor) : t("RELGRAPH.Common.OtherUser") }));
      this.#updateToolbar();
      return;
    }

    // Начинаем с самых свежих данных — вдруг что-то пришло, пока окно было в фоне.
    const data = (await loadGraphData()) ?? this.#currentData ?? EMPTY_GRAPH;
    this.#setEditing(true);
    this.#display(data, true);
  }

  /** Выход из режима: кнопкой, по таймауту бездействия или при закрытии окна. */
  async #stopEditing(notice?: string): Promise<void> {
    if (!this.#editing) return;
    this.#setEditing(false);
    if (this.#currentData) this.#display(this.#currentData, true);
    if (notice) ui.notifications?.info(notice);
    const userId: string | undefined = game.user?.id;
    if (userId) {
      await releaseEditLock(userId).catch((err: unknown) => {
        console.warn("fvtt-relationship-graph | edit lock release failed", err);
      });
    }
  }

  #setEditing(editing: boolean): void {
    this.#editing = editing;
    // История — на один сеанс редактирования
    this.#history.clear();
    this.#idleTimer?.stop();
    this.#idleTimer = null;
    const root = this.#cyHost?.parentElement;
    if (editing && root) {
      this.#idleTimer = startIdleTimer(root, IDLE_TIMEOUT_MS, () => {
        void this.#stopEditing(t("RELGRAPH.Graph.EditingIdle"));
      });
    }
    this.#updateToolbar();
  }

  #updateToolbar(): void {
    const button = this.#editButton;
    if (button) {
      const editor = currentEditor();
      const busy = !this.#editing && editor !== null && editor !== game.user?.id;
      button.disabled = busy;
      button.classList.toggle("frg-toolbar-active", this.#editing);
      button.innerHTML = this.#editing
        ? `<i class="fa-solid fa-check"></i> ${t("RELGRAPH.Graph.StopEditing")}`
        : `<i class="fa-solid fa-pen"></i> ${t("RELGRAPH.Common.Edit")}`;
      button.title = busy && editor ? t("RELGRAPH.Graph.EditingBy", { user: userName(editor) }) : "";
    }
    if (this.#undoButton) this.#undoButton.disabled = !this.#editing || !this.#history.canUndo;
    if (this.#redoButton) this.#redoButton.disabled = !this.#editing || !this.#history.canRedo;
    this.#importControl?.setEnabled(this.#editing);
    if (this.#backgroundButton) {
      this.#backgroundButton.disabled = !this.#editing;
      this.#backgroundButton.title = this.#editing ? t("RELGRAPH.Background.Panel") : t("RELGRAPH.Background.PanelDisabled");
    }
  }

  // ---------------------------------------------------------------------------------------

  /** keepViewport — сохранить текущие zoom/pan (перерисовка после правки, а не первое открытие/импорт). */
  #display(data: GraphData, keepViewport = false): void {
    if (!this.#cyHost) return;

    const viewport = keepViewport && this.#cy ? { zoom: this.#cy.zoom(), pan: { ...this.#cy.pan() } } : null;
    this.#closePanel();

    const hydrated: GraphData = { ...data, nodes: syncNodesWithActors(data.nodes) };
    this.#currentData = hydrated;

    this.#interaction?.teardown();
    this.#overlays?.destroy();
    this.#decor?.destroy();
    this.#edgeLabels?.destroy();
    this.#background?.destroy();
    this.#factionBlobs?.destroy();
    this.#resizeObserver?.disconnect();
    this.#cy?.destroy(); // снимает и собственные DOM-листенеры (включая wheel) старого cytoscape

    // Оверлеи живут в wrapper (родитель cyHost), а не в самом контейнере Cytoscape —
    // иначе клики по меню доходили бы до графа.
    this.#overlays = createOverlays(this.#cyHost.parentElement ?? this.#cyHost);

    // Порядок важен: setupInteraction должен зарегистрировать свой wheel-listener на
    // cyHost РАНЬШЕ, чем cytoscape(...) внутри renderGraph зарегистрирует свой —
    // см. комментарий в interaction.ts про capture-фазу и порядок регистрации.
    this.#interaction = setupInteraction(this.#cyHost, {
      onNodesChanged: (nodes) => {
        void this.#persistNodeChanges(nodes);
      },
      onContextMenu: (target, client) => this.#openContextMenu(target, client),
      onInfo: (target, client) => this.#onDoubleClick(target, client),
      onQuickLink: (nodeId) => {
        this.#interaction?.startLinking(nodeId);
      },
      onLinkPicked: (sourceId, targetId) => this.#openNewEdgePanel(sourceId, targetId),
      onDeleteSelected: (nodeIds, edgeIds) => {
        void this.#deleteSelected(nodeIds, edgeIds);
      },
      onUndo: () => {
        void this.#undo();
      },
      onRedo: () => {
        void this.#redo();
      },
    }, { editable: this.#editing });
    // шрифт подписей: HTML-слою (node-decor.ts) — через CSS-переменную, Cytoscape — в стиле связей
    const fontFamily = graphFontFamily(hydrated.background);
    this.#cyHost.style.setProperty("--frg-font", fontFamily);
    this.#cy = renderGraph(this.#cyHost, hydrated, { isGM: this.#isGM, editable: this.#editing, fontFamily });
    if (viewport) this.#cy.viewport(viewport);
    this.#interaction.bind(this.#cy);
    this.#zoomControl?.attach(this.#cy);
    this.#decor = createNodeDecorLayer(this.#cyHost, this.#cy, hydrated, { isGM: this.#isGM });
    this.#edgeLabels = setupEdgeLabels(this.#cy);
    // Оба слоя встают в начало контейнера — под канвас Cytoscape (см. background-layer.ts).
    // Фон создаётся последним, чтобы оказаться первым в DOM — под областями фракций.
    this.#factionBlobs = createFactionBlobLayer(this.#cyHost, this.#cy);
    this.#background = createBackgroundLayer(this.#cyHost, this.#cy, hydrated.background);

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(this.#cyHost);
  }

  /**
   * Что можно игроку — core/permissions.ts: обычные узлы и связи он правит, создаёт и
   * удаляет наравне с GM; gmOnly-узлы, флаги видимости, заметки GM, привязка к актёру и
   * справочники (кроме описания фракции) — только GM. Для этого журнал-хранилище открыт
   * игрокам на запись (foundry/storage.ts).
   */
  get #isGM(): boolean {
    return game.user?.isGM === true;
  }

  /**
   * Двойной клик ЛКМ: в режиме просмотра — карточка информации, в режиме редактирования —
   * панель редактирования узла, связи или фракции. Узел «Правит только GM» игроку панель не
   * откроет — ему показывается карточка.
   */
  #onDoubleClick(target: GraphTarget, client: Point): void {
    const data = this.#currentData;
    if (!data || target.kind === "background") return;
    if (this.#editing) {
      if (target.kind === "edge") {
        this.#openEdgePanel(target.id);
        return;
      }
      if (target.kind === "faction") {
        this.#openFactionPanel(target.id); // игроку — с правкой только описания
        return;
      }
      const node = data.nodes.find((n) => n.id === target.id);
      if (node && canEditNode(node, this.#isGM)) {
        this.#openNodePanel(target.id);
        return;
      }
    }
    this.#openInfo(target, client);
  }

  #openInfo(target: GraphTarget, client: Point): void {
    if (!this.#currentData || target.kind === "background") return;
    const options = { isGM: this.#isGM };
    const card =
      target.kind === "node"
        ? describeNode(this.#currentData, target.id, options)
        : target.kind === "edge"
          ? describeEdge(this.#currentData, target.id, options)
          : describeFaction(this.#currentData, target.id, options);
    if (!card) return;
    this.#lastInfo = { target, client };
    this.#overlays?.showInfo(client, card);
  }

  /** Имя узла для заголовков панелей; скрытый узел у игрока — «Неизвестный». */
  #nodeName(data: GraphData, nodeId: string): string {
    const node = data.nodes.find((n) => n.id === nodeId);
    return node ? displayName(node, this.#isGM) : "?";
  }

  #closePanel(): void {
    this.#panel?.remove();
    this.#panel = null;
    this.#reopenPanel = null;
  }

  /** reopen — как открыть панель заново после перерисовки чужим изменением (у списков). */
  #mountPanel(panel: HTMLElement, reopen: (() => void) | null = null): void {
    this.#closePanel();
    this.#panel = panel;
    this.#reopenPanel = reopen;
    this.#cyHost?.parentElement?.append(panel);
  }

  /**
   * Сохраняет изменённый граф и перерисовывает его, не сбрасывая zoom/pan. Только в режиме
   * редактирования. Каждый commit — шаг истории, кроме самих отмены/повтора (record: false).
   */
  async #commit(data: GraphData, { record = true } = {}): Promise<void> {
    if (!this.#editing) return;
    const before = this.#currentData;
    try {
      await saveGraphData(data);
    } catch (err) {
      // Типичный случай: игрок без права записи (GM ещё не открывал граф после обновления модуля).
      console.error("fvtt-relationship-graph | save failed", err);
      ui.notifications?.error(t("RELGRAPH.Graph.SaveFailed"));
      return;
    }
    if (record && before) this.#history.record(before);
    this.#display(data, true);
    this.#updateToolbar();
  }

  async #confirm(title: string, text: string): Promise<boolean> {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    const result = await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content: paragraph.outerHTML,
    });
    return result === true;
  }

  /** Актёры мира для привязки узла, по алфавиту. */
  #actorOptions(): ActorOption[] {
    const actors: ActorOption[] = (game.actors?.contents ?? []).map((a: { id: string; name: string }) => ({
      id: a.id,
      name: a.name,
    }));
    return actors.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * «Добавить узел»: узел появляется в точке клика и сразу открывается его панель.
   * factionId — область, по которой кликнули (узел сразу входит в её фракцию).
   */
  async #createNode(client: Point, factionId: string | null): Promise<void> {
    if (!this.#currentData || !this.#cy || !this.#cyHost) return;
    const rect = this.#cyHost.getBoundingClientRect();
    const position = clientToModel(client.x, client.y, {
      left: rect.left,
      top: rect.top,
      pan: this.#cy.pan(),
      zoom: this.#cy.zoom(),
    });
    const nodeId = foundry.utils.randomID();
    await this.#commit(addNode(this.#currentData, blankNode(nodeId, position, factionId)));
    // Клик мог прийтись вплотную к другому узлу — раздвигаем соседей.
    this.#settle(nodeId);
    this.#openNodePanel(nodeId);
  }

  /**
   * Завершение «Создать связь»: открывается панель новой связи. Сама связь появляется только
   * после сохранения, и только если в ней хоть что-то заполнено — пустые связи не создаём.
   */
  #openNewEdgePanel(sourceId: string, targetId: string): void {
    const data = this.#currentData;
    if (!data) return;

    const edgeId = `${sourceId}-${targetId}-${foundry.utils.randomID()}`;
    const nameOf = (id: string) => this.#nodeName(data, id);
    const panel = createEdgePanel(
      blankEdge(edgeId, sourceId, targetId),
      { source: nameOf(sourceId), target: nameOf(targetId) },
      data.relationshipTypes,
      {
        onSave: (values) => {
          void this.#saveNewEdge(blankEdge(edgeId, sourceId, targetId), values);
        },
        onDelete: () => this.#closePanel(),
        onClose: () => this.#closePanel(),
      },
      { isNew: true, isGM: this.#isGM },
    );
    this.#mountPanel(panel);
  }

  async #saveNewEdge(edge: GraphEdge, values: Parameters<typeof applyEdgeEdit>[2]): Promise<void> {
    if (!this.#currentData) return;
    const data = applyEdgeEdit(addEdge(this.#currentData, edge), edge.id, values);
    if (isBlankEdge(data.edges.find((e) => e.id === edge.id)!)) {
      this.#closePanel();
      ui.notifications?.info(t("RELGRAPH.Edge.EmptyNotCreated"));
      return;
    }
    await this.#commit(data);
  }

  #openNodePanel(nodeId: string): void {
    const data = this.#currentData;
    const node = data?.nodes.find((n) => n.id === nodeId);
    if (!data || !node || !canEditNode(node, this.#isGM)) return;

    const panel = createNodePanel(
      node,
      data.factions,
      allConditions(data),
      this.#actorOptions(),
      {
        onSave: (values) => {
          void this.#saveNode(nodeId, values);
        },
        onDelete: () => {
          void this.#deleteNode(nodeId, nodeName(node));
        },
        onClose: () => this.#closePanel(),
      },
      { isGM: this.#isGM },
    );
    this.#mountPanel(panel);
  }

  async #saveNode(nodeId: string, values: Parameters<typeof applyNodeEdit>[2]): Promise<void> {
    const node = this.#currentData?.nodes.find((n) => n.id === nodeId);
    if (!this.#currentData || !node || !canEditNode(node, this.#isGM)) return;
    await this.#commit(applyNodeEdit(this.#currentData, nodeId, restrictNodeEdit(node, values, this.#isGM)));
    // Размер или область могли измениться — раздвигаем соседей (позиции сохранит onNodesChanged).
    this.#settle(nodeId);
  }

  /** Удаляются и невидимые игроку gmOnly-связи узла — но в тексте подтверждения их нет. */
  async #deleteNode(nodeId: string, name: string): Promise<void> {
    const data = this.#currentData;
    const node = data?.nodes.find((n) => n.id === nodeId);
    if (!data || !node || !canEditNode(node, this.#isGM)) return;
    const edges = visibleEdgeCount(data, nodeId, this.#isGM);
    const text = edges > 0 ? t("RELGRAPH.Node.DeleteConfirmEdges", { name, count: edges }) : t("RELGRAPH.Node.DeleteConfirm", { name });
    const confirmed = await this.#confirm(t("RELGRAPH.Node.Delete"), text);
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeNode(this.#currentData, nodeId));
  }

  #openEdgePanel(edgeId: string): void {
    const data = this.#currentData;
    const edge = data?.edges.find((e) => e.id === edgeId);
    if (!data || !edge) return;

    const nameOf = (id: string) => this.#nodeName(data, id);
    const panel = createEdgePanel(
      edge,
      { source: nameOf(edge.source), target: nameOf(edge.target) },
      data.relationshipTypes,
      {
        onSave: (values) => {
          if (this.#currentData) void this.#commit(applyEdgeEdit(this.#currentData, edgeId, values));
        },
        onDelete: () => {
          void this.#deleteEdge(edgeId);
        },
        onClose: () => this.#closePanel(),
      },
      { isGM: this.#isGM },
    );
    this.#mountPanel(panel);
  }

  /**
   * Список всех фракций — единственный путь к фракции без узлов: её на графе нет. Игрок видит
   * список и правит описание. Дополнительные фракции скрытых узлов игроку в счёт не идут.
   */
  #openFactionList(): void {
    const data = this.#currentData;
    if (!data) return;

    const isGM = this.#isGM;
    const panel = createFactionListPanel(
      data.factions,
      (factionId) =>
        data.nodes.filter((n) =>
          isMasked(n, isGM) ? n.primaryFactionId === factionId : n.factionIds.includes(factionId),
        ).length,
      {
        onEdit: (factionId) => this.#openFactionPanel(factionId),
        onCreate: () => this.#openFactionPanel(null),
        onClose: () => this.#closePanel(),
      },
      { editable: this.#editing, canCreate: isGM },
    );
    this.#mountPanel(panel, () => this.#openFactionList());
  }

  /** factionId === null — создание новой фракции (только GM). */
  #openFactionPanel(factionId: string | null): void {
    const data = this.#currentData;
    const faction = factionId === null ? null : data?.factions.find((f) => f.id === factionId);
    if (!data || faction === undefined || (faction === null && !this.#isGM)) return;

    const panel = createFactionPanel(
      faction,
      {
        onSave: (values) => {
          void this.#saveFaction(factionId, values);
        },
        onDelete: () => {
          if (faction) void this.#deleteFaction(faction.id, factionName(faction));
        },
        onClose: () => this.#closePanel(),
      },
      { isGM: this.#isGM },
    );
    this.#mountPanel(panel);
  }

  async #saveFaction(factionId: string | null, values: FactionEditValues): Promise<void> {
    const current = this.#currentData;
    if (!current) return;
    let data: GraphData;
    if (factionId === null) {
      if (!this.#isGM) return;
      data = createFactionFromEdit(current, foundry.utils.randomID(), values);
    } else {
      const faction = current.factions.find((f) => f.id === factionId);
      if (!faction) return;
      data = applyFactionEdit(current, factionId, restrictFactionEdit(faction, values, this.#isGM));
    }
    await this.#commit(data);
    this.#openFactionList();
  }

  async #deleteFaction(factionId: string, name: string): Promise<void> {
    if (!this.#isGM) return;
    const confirmed = await this.#confirm(
      t("RELGRAPH.Faction.Delete"),
      t("RELGRAPH.Faction.DeleteConfirm", { name }),
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeFaction(this.#currentData, factionId));
    this.#openFactionList();
  }

  /**
   * Справочник состояний: встроенные + свои. Правит только GM, игрок видит список.
   * Состояния скрытых узлов игроку в счёт не идут — их значков он не видит.
   */
  #openConditionList(): void {
    const data = this.#currentData;
    if (!data) return;

    const isGM = this.#isGM;
    const panel = createConditionListPanel(
      allConditions(data),
      (conditionId) => data.nodes.filter((n) => !isMasked(n, isGM) && n.conditions.includes(conditionId)).length,
      {
        onEdit: (conditionId) => this.#openConditionPanel(conditionId),
        onCreate: () => this.#openConditionPanel(null),
        onClose: () => this.#closePanel(),
      },
      { editable: isGM && this.#editing },
    );
    this.#mountPanel(panel, () => this.#openConditionList());
  }

  /** conditionId === null — создание нового состояния. Встроенные сюда не попадают. Только GM. */
  #openConditionPanel(conditionId: string | null): void {
    const data = this.#currentData;
    const condition = conditionId === null ? null : data?.conditions.find((c) => c.id === conditionId);
    if (!data || condition === undefined || !this.#isGM) return;

    const panel = createConditionPanel(condition, {
      onSave: (values) => {
        void this.#saveCondition(conditionId, values);
      },
      onDelete: () => {
        if (condition) void this.#deleteCondition(condition.id, conditionLabel(condition));
      },
      onClose: () => this.#closePanel(),
    });
    this.#mountPanel(panel);
  }

  async #saveCondition(conditionId: string | null, values: ConditionEditValues): Promise<void> {
    if (!this.#currentData) return;
    const data =
      conditionId === null
        ? createCondition(this.#currentData, foundry.utils.randomID(), values)
        : updateCondition(this.#currentData, conditionId, values);
    await this.#commit(data);
    this.#openConditionList();
  }

  async #deleteCondition(conditionId: string, label: string): Promise<void> {
    const confirmed = await this.#confirm(
      t("RELGRAPH.Condition.Delete"),
      t("RELGRAPH.Condition.DeleteConfirm", { label }),
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeCondition(this.#currentData, conditionId));
    this.#openConditionList();
  }

  /** Фон графа: только GM в режиме редактирования (кнопка на верхней панели). */
  #openBackgroundPanel(): void {
    const data = this.#currentData;
    if (!data || !this.#isGM || !this.#editing) return;

    const panel = createBackgroundPanel(data.background ?? null, [...foundryFonts(), ...SYSTEM_FONTS], {
      onSave: (values) => {
        void this.#saveBackground(values);
      },
      onReset: () => {
        if (this.#currentData) void this.#commit(setBackground(this.#currentData, null));
      },
      onClose: () => this.#closePanel(),
      fitToView: (image) => this.#fitBackgroundToView(image),
    });
    this.#mountPanel(panel);
  }

  async #saveBackground(values: BackgroundEditValues): Promise<void> {
    if (!this.#currentData || !this.#isGM) return;
    await this.#commit(setBackground(this.#currentData, backgroundFromEdit(values)));
  }

  /** Положение картинки, при котором она закрывает видимую часть графа. null — картинка не загрузилась. */
  async #fitBackgroundToView(image: string): Promise<{ imageX: number; imageY: number; imageWidth: number } | null> {
    const cy = this.#cy;
    if (!cy) return null;
    const natural = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const probe = new Image();
      probe.addEventListener("load", () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight }));
      probe.addEventListener("error", () => resolve(null));
      probe.src = image;
    });
    if (!natural) {
      ui.notifications?.warn(t("RELGRAPH.Background.ImageLoadFailed"));
      return null;
    }
    const extent = cy.extent();
    return coverVisibleArea({ x: extent.x1, y: extent.y1, width: extent.w, height: extent.h }, natural);
  }

  /** Справочник типов связей. Правит только GM, игрок видит список; gmOnly-связи игроку в счёт не идут. */
  #openRelationshipTypeList(): void {
    const data = this.#currentData;
    if (!data) return;

    const isGM = this.#isGM;
    const panel = createRelationshipTypeListPanel(
      data.relationshipTypes,
      (typeId) => data.edges.filter((e) => e.relationshipTypeId === typeId && (isGM || !e.gmOnly)).length,
      {
        onEdit: (typeId) => this.#openRelationshipTypePanel(typeId),
        onCreate: () => this.#openRelationshipTypePanel(null),
        onClose: () => this.#closePanel(),
      },
      { editable: isGM && this.#editing },
    );
    this.#mountPanel(panel, () => this.#openRelationshipTypeList());
  }

  /** typeId === null — создание нового типа связи. Только GM. */
  #openRelationshipTypePanel(typeId: string | null): void {
    const data = this.#currentData;
    const type = typeId === null ? null : data?.relationshipTypes.find((rt) => rt.id === typeId);
    if (!data || type === undefined || !this.#isGM) return;

    const panel = createRelationshipTypePanel(type, {
      onSave: (values) => {
        void this.#saveRelationshipType(typeId, values);
      },
      onDelete: () => {
        if (type) void this.#deleteRelationshipType(type.id, relationshipTypeLabel(type));
      },
      onClose: () => this.#closePanel(),
    });
    this.#mountPanel(panel);
  }

  async #saveRelationshipType(typeId: string | null, values: RelationshipTypeEditValues): Promise<void> {
    if (!this.#currentData) return;
    const data =
      typeId === null
        ? createRelationshipType(this.#currentData, foundry.utils.randomID(), values)
        : updateRelationshipType(this.#currentData, typeId, values);
    await this.#commit(data);
    this.#openRelationshipTypeList();
  }

  async #deleteRelationshipType(typeId: string, label: string): Promise<void> {
    const confirmed = await this.#confirm(
      t("RELGRAPH.RelationshipType.Delete"),
      t("RELGRAPH.RelationshipType.DeleteConfirm", { label }),
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeRelationshipType(this.#currentData, typeId));
    this.#openRelationshipTypeList();
  }

  async #deleteEdge(edgeId: string): Promise<void> {
    const edge = this.#currentData?.edges.find((e) => e.id === edgeId);
    if (!edge || (edge.gmOnly && !this.#isGM)) return;
    const confirmed = await this.#confirm(t("RELGRAPH.Edge.Delete"), t("RELGRAPH.Edge.DeleteConfirm"));
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeEdge(this.#currentData, edgeId));
  }

  /** В режиме просмотра остаются только пункты, которые ничего не меняют. */
  #openContextMenu(target: GraphTarget, client: Point): void {
    const items: MenuItem[] = [];
    const editing = this.#editing;

    if (target.kind === "node") {
      const nodeId = target.id;
      const node = this.#currentData?.nodes.find((n) => n.id === nodeId);
      // gmOnly-узел игрок не правит и не ресайзит
      const editable = editing && node !== undefined && canEditNode(node, this.#isGM);
      items.push({ label: t("RELGRAPH.Common.Info"), onSelect: () => this.#openInfo(target, client) });
      if (editable) items.push({ label: t("RELGRAPH.Common.Edit"), onSelect: () => this.#openNodePanel(nodeId) });
      if (editing) items.push({ label: t("RELGRAPH.Menu.CreateEdge"), onSelect: () => this.#interaction?.startLinking(nodeId) });
      // Лист актёра открывает только GM: игроку он выдал бы лишнее (у скрытого узла — ещё и кто это).
      const actorId = node && this.#isGM ? node.actorId : null;
      const actor = actorId ? game.actors?.get(actorId) : null;
      if (actor) items.push({ label: t("RELGRAPH.Menu.OpenActorSheet"), onSelect: () => actor.sheet?.render(true) });
      if (editable) items.push({ label: t("RELGRAPH.Menu.ResetSize"), onSelect: () => this.#interaction?.resetScale(nodeId) });
    } else if (target.kind === "edge") {
      const edgeId = target.id;
      if (editing) {
        items.push({ label: t("RELGRAPH.Menu.EditEdge"), onSelect: () => this.#openEdgePanel(edgeId) });
        items.push({
          label: t("RELGRAPH.Edge.Delete"),
          onSelect: () => {
            void this.#deleteEdge(edgeId);
          },
        });
      } else {
        items.push({ label: t("RELGRAPH.Common.Info"), onSelect: () => this.#openInfo(target, client) });
      }
    } else if (target.kind === "faction") {
      const factionId = target.id;
      items.push({ label: t("RELGRAPH.Common.Info"), onSelect: () => this.#openInfo(target, client) });
      items.push({ label: t("RELGRAPH.Menu.SelectArea"), onSelect: () => this.#interaction?.selectFaction(factionId) });
      // игроку форма фракции открывается с правкой только описания
      if (editing) items.push({ label: t("RELGRAPH.Menu.EditFaction"), onSelect: () => this.#openFactionPanel(factionId) });
    }

    // У узла и связи своё меню — создание узла и общие списки там лишние.
    if (target.kind === "faction" || target.kind === "background") {
      const factionId = target.kind === "faction" ? target.id : null;
      if (editing) {
        items.push({
          label: t("RELGRAPH.Menu.AddNode"),
          onSelect: () => {
            void this.#createNode(client, factionId);
          },
        });
      }
      items.push({ label: t("RELGRAPH.Menu.Factions"), onSelect: () => this.#openFactionList() });
      items.push({ label: t("RELGRAPH.Menu.RelationshipTypes"), onSelect: () => this.#openRelationshipTypeList() });
      items.push({ label: t("RELGRAPH.Menu.Conditions"), onSelect: () => this.#openConditionList() });
    }

    items.push({ label: t("RELGRAPH.Graph.FitAll"), onSelect: () => this.#cy?.fit(undefined, 30) });
    if (this.#cy?.$(":selected").nonempty()) {
      items.push({ label: t("RELGRAPH.Menu.ClearSelection"), onSelect: () => this.#cy?.$(":selected").unselect() });
    }

    this.#overlays?.showMenu(client, items);
  }

  /** Мержит снэпшот x/y/scale от interaction.ts в текущий GraphData и сохраняет целиком. */
  /**
   * Мержит снэпшот x/y/scale от interaction.ts в текущий GraphData и сохраняет целиком.
   * Шаг истории (drag/resize вместе с сепарацией); после #settle — часть предыдущего шага.
   * Ничего не сдвинулось — ничего не сохраняем.
   */
  async #persistNodeChanges(snapshots: NodeSnapshot[]): Promise<void> {
    const before = this.#currentData;
    if (!before || !this.#editing) return;

    const byId = new Map(snapshots.map((s) => [s.id, s]));
    let changed = false;
    const nodes: GraphNode[] = before.nodes.map((n) => {
      const s = byId.get(n.id);
      if (!s || (s.x === n.x && s.y === n.y && s.scale === n.scale)) return n;
      changed = true;
      return { ...n, x: s.x, y: s.y, scale: s.scale };
    });
    if (!changed) return;

    if (!this.#mergeNextStep) this.#history.record(before);
    this.#currentData = { ...before, nodes };
    this.#updateToolbar();
    await saveGraphData(this.#currentData);
  }

  async close(options?: unknown): Promise<this> {
    // Закрыл окно в режиме редактирования — вышел из режима.
    if (this.#editing) {
      this.#setEditing(false);
      const userId: string | undefined = game.user?.id;
      if (userId) {
        void releaseEditLock(userId).catch((err: unknown) => {
          console.warn("fvtt-relationship-graph | edit lock release failed", err);
        });
      }
    }
    this.#hooks.forEach(([name, id]) => Hooks.off(name, id));
    this.#hooks = [];
    this.#editButton = null;
    this.#undoButton = null;
    this.#redoButton = null;
    this.#backgroundButton = null;
    this.#importControl = null;
    this.#history.clear();
    this.#lastInfo = null;
    this.#interaction?.teardown();
    this.#interaction = null;
    this.#overlays?.destroy();
    this.#overlays = null;
    this.#decor?.destroy();
    this.#decor = null;
    this.#edgeLabels?.destroy();
    this.#edgeLabels = null;
    this.#background?.destroy();
    this.#background = null;
    this.#factionBlobs?.destroy();
    this.#factionBlobs = null;
    this.#zoomControl?.destroy();
    this.#zoomControl = null;
    this.#closePanel();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cy?.destroy();
    this.#cy = null;
    this.#cyHost = null;
    this.#currentData = null;
    return super.close(options as never);
  }
}
