/**
 * ApplicationV2-оболочка для графа. Структурно повторяет проверенный
 * spikes/spike-foundry-app.ts (S4), но грузит реальные данные вместо фикстуры:
 * storage.loadGraphData() -> actors.syncNodesWithActors() -> graph-renderer.renderGraph()
 * -> interaction.setupInteraction() (мышь/клавиши, см. interaction.ts и docs/controls.md).
 * Контекстное меню и карточку информации (overlays.ts) наполняет этот класс.
 */

import type cytoscape from "cytoscape";
import type { GraphData, GraphEdge, GraphNode } from "../core/model";
import { syncNodesWithActors } from "../foundry/actors";
import { allowPlayersToSave, loadGraphData, saveGraphData } from "../foundry/storage";
import {
  allConditions,
  createCondition,
  removeCondition,
  updateCondition,
  type ConditionEditValues,
} from "../core/conditions";
import { describeFaction, describeNode } from "../core/describe";
import {
  applyEdgeEdit,
  applyFactionEdit,
  applyNodeEdit,
  blankEdge,
  blankNode,
  createFactionFromEdit,
  isBlankEdge,
  type FactionEditValues,
} from "../core/edit";
import { addEdge, addNode, removeEdge, removeFaction, removeNode } from "../core/graph-state";
import { clientToModel, type Point } from "../core/hit-test";
import {
  createRelationshipType,
  ensureDefaultRelationshipTypes,
  removeRelationshipType,
  updateRelationshipType,
  type RelationshipTypeEditValues,
} from "../core/relationship-types";
import { canEditNode, restrictFactionEdit, restrictNodeEdit, visibleEdgeCount } from "../core/permissions";
import { displayName, isMasked } from "../core/visibility";
import { setupEdgeLabels, type EdgeLabelsHandle } from "./edge-labels";
import { renderGraph } from "./graph-renderer";
import { setupInteraction, type GraphTarget, type InteractionHandle, type NodeSnapshot } from "./interaction";
import { createNodeDecorLayer, type NodeDecorLayer } from "./node-decor";
import { createOverlays, type MenuItem, type Overlays } from "./overlays";
import { createConditionListPanel, createConditionPanel } from "./panels/ConditionPanel";
import { createEdgePanel } from "./panels/EdgePanel";
import { createFactionListPanel, createFactionPanel } from "./panels/FactionPanel";
import { createImportControl } from "./panels/ImportDialog";
import { createNodePanel, type ActorOption } from "./panels/NodePanel";
import { createRelationshipTypeListPanel, createRelationshipTypePanel } from "./panels/RelationshipTypePanel";

declare const foundry: any;
declare const game: any;
declare const ui: any;

const EMPTY_GRAPH: GraphData = ensureDefaultRelationshipTypes({
  nodes: [],
  edges: [],
  factions: [],
  relationshipTypes: [],
  conditions: [],
});

const ApplicationV2 = foundry.applications.api.ApplicationV2;

export class GraphApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fvtt-relationship-graph-app",
    window: {
      title: "Relationship Graph",
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
  /** Открытая боковая панель редактирования (NodePanel/EdgePanel) — максимум одна. */
  #panel: HTMLElement | null = null;
  #cyHost: HTMLElement | null = null;
  /** Актуальный полный граф (с синхронизированными актёрами) — источник для персиста позиций/scale. */
  #currentData: GraphData | null = null;

  async _renderHTML(): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    // position:relative — контекстное меню/карточка информации позиционируются внутри wrapper.
    wrapper.style.cssText = "position:relative;width:100%;height:100%;display:flex;flex-direction:column;";

    const toolbar = createImportControl({
      onImported: (data) => {
        void this.#importAndDisplay(data);
      },
    });

    const cyHost = document.createElement("div");
    // position/overflow — для слоя декора узлов (node-decor.ts), он живёт внутри cyHost.
    cyHost.style.cssText = "position:relative;overflow:hidden;flex:1 1 auto;min-height:0;background:#16213e;";

    wrapper.append(toolbar, cyHost);
    (wrapper as unknown as { _cyHost: HTMLElement })._cyHost = cyHost;
    return wrapper;
  }

  async _replaceHTML(result: HTMLElement, content: HTMLElement): Promise<void> {
    content.replaceChildren(result);
    this.#cyHost = (result as unknown as { _cyHost: HTMLElement })._cyHost;

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
    await saveGraphData(data);
    this.#display(data);
  }

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
      onInfo: (target, client) => this.#openInfo(target, client),
      onQuickLink: (nodeId) => {
        this.#interaction?.startLinking(nodeId);
      },
      onLinkPicked: (sourceId, targetId) => this.#openNewEdgePanel(sourceId, targetId),
    });
    this.#cy = renderGraph(this.#cyHost, hydrated, { isGM: this.#isGM });
    if (viewport) this.#cy.viewport(viewport);
    this.#interaction.bind(this.#cy);
    this.#decor = createNodeDecorLayer(this.#cyHost, this.#cy, hydrated, { isGM: this.#isGM });
    this.#edgeLabels = setupEdgeLabels(this.#cy);

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(this.#cyHost);
  }

  /**
   * Что можно игроку — core/permissions.ts (B14): обычные узлы и связи он правит, создаёт и
   * удаляет наравне с GM; gmOnly-узлы, флаги видимости, заметки GM, привязка к актёру и
   * справочники (кроме описания фракции) — только GM. Для этого журнал-хранилище открыт
   * игрокам на запись (foundry/storage.ts).
   */
  get #isGM(): boolean {
    return game.user?.isGM === true;
  }

  #openInfo(target: GraphTarget, client: Point): void {
    if (!this.#currentData || target.kind === "background") return;
    if (target.kind === "edge") {
      // У связи отдельной карточки нет — двойной клик сразу открывает панель.
      this.#openEdgePanel(target.id);
      return;
    }
    const card =
      target.kind === "node"
        ? describeNode(this.#currentData, target.id, { isGM: this.#isGM })
        : describeFaction(this.#currentData, target.id, { isGM: this.#isGM });
    if (card) this.#overlays?.showInfo(client, card);
  }

  /** Имя узла для заголовков панелей; скрытый узел у игрока — «Неизвестный». */
  #nodeName(data: GraphData, nodeId: string): string {
    const node = data.nodes.find((n) => n.id === nodeId);
    return node ? displayName(node, this.#isGM) : "?";
  }

  #closePanel(): void {
    this.#panel?.remove();
    this.#panel = null;
  }

  #mountPanel(panel: HTMLElement): void {
    this.#closePanel();
    this.#panel = panel;
    this.#cyHost?.parentElement?.append(panel);
  }

  /** Сохраняет изменённый граф и перерисовывает его, не сбрасывая zoom/pan. */
  async #commit(data: GraphData): Promise<void> {
    try {
      await saveGraphData(data);
    } catch (err) {
      // Типичный случай: игрок без права записи (GM ещё не открывал граф после обновления модуля).
      console.error("fvtt-relationship-graph | save failed", err);
      ui.notifications?.error("Не удалось сохранить граф — см. консоль. Игрокам запись открывается, когда граф откроет GM.");
      return;
    }
    this.#display(data, true);
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
    this.#interaction?.settle(nodeId);
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
      ui.notifications?.info("Связь не создана: в ней ничего не заполнено.");
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
          void this.#deleteNode(nodeId, node.name);
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
    this.#interaction?.settle(nodeId);
  }

  /** Удаляются и невидимые игроку gmOnly-связи узла — но в тексте подтверждения их нет. */
  async #deleteNode(nodeId: string, name: string): Promise<void> {
    const data = this.#currentData;
    const node = data?.nodes.find((n) => n.id === nodeId);
    if (!data || !node || !canEditNode(node, this.#isGM)) return;
    const edges = visibleEdgeCount(data, nodeId, this.#isGM);
    const text = edges > 0 ? `Удалить узел «${name}» и его связи (${edges})?` : `Удалить узел «${name}»?`;
    const confirmed = await this.#confirm("Удалить узел", text);
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
   * список и правит описание (B14). Дополнительные фракции скрытых узлов игроку в счёт не идут.
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
      { isGM },
    );
    this.#mountPanel(panel);
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
          if (faction) void this.#deleteFaction(faction.id, faction.name);
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
      "Удалить фракцию",
      `Удалить фракцию «${name}»? Её узлы останутся на графе, но без этой фракции.`,
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeFaction(this.#currentData, factionId));
    this.#openFactionList();
  }

  /**
   * Справочник состояний: встроенные + свои. Правит только GM, игрок видит список (B14).
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
      { isGM },
    );
    this.#mountPanel(panel);
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
        if (condition) void this.#deleteCondition(condition.id, condition.label);
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
      "Удалить состояние",
      `Удалить состояние «${label}»? Оно будет снято со всех узлов.`,
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeCondition(this.#currentData, conditionId));
    this.#openConditionList();
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
      { isGM },
    );
    this.#mountPanel(panel);
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
        if (type) void this.#deleteRelationshipType(type.id, type.label);
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
      "Удалить тип связи",
      `Удалить тип связи «${label}»? Связи этого типа останутся, но без типа.`,
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeRelationshipType(this.#currentData, typeId));
    this.#openRelationshipTypeList();
  }

  async #deleteEdge(edgeId: string): Promise<void> {
    const edge = this.#currentData?.edges.find((e) => e.id === edgeId);
    if (!edge || (edge.gmOnly && !this.#isGM)) return;
    const confirmed = await this.#confirm("Удалить связь", "Удалить эту связь?");
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeEdge(this.#currentData, edgeId));
  }

  #openContextMenu(target: GraphTarget, client: Point): void {
    const items: MenuItem[] = [];

    if (target.kind === "node") {
      const nodeId = target.id;
      const node = this.#currentData?.nodes.find((n) => n.id === nodeId);
      // gmOnly-узел игрок не правит и не ресайзит (B14)
      const editable = node !== undefined && canEditNode(node, this.#isGM);
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      if (editable) items.push({ label: "Редактировать", onSelect: () => this.#openNodePanel(nodeId) });
      items.push({ label: "Создать связь", onSelect: () => this.#interaction?.startLinking(nodeId) });
      // У скрытого узла игроку лист актёра не предлагаем — он выдал бы, кто это.
      const actorId = node && !isMasked(node, this.#isGM) ? node.actorId : null;
      const actor = actorId ? game.actors?.get(actorId) : null;
      if (actor) items.push({ label: "Открыть лист актёра", onSelect: () => actor.sheet?.render(true) });
      if (editable) items.push({ label: "Сбросить размер", onSelect: () => this.#interaction?.resetScale(nodeId) });
    } else if (target.kind === "edge") {
      const edgeId = target.id;
      items.push({ label: "Редактировать связь", onSelect: () => this.#openEdgePanel(edgeId) });
      items.push({
        label: "Удалить связь",
        onSelect: () => {
          void this.#deleteEdge(edgeId);
        },
      });
    } else if (target.kind === "faction") {
      const factionId = target.id;
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      items.push({ label: "Выбрать область", onSelect: () => this.#interaction?.selectFaction(factionId) });
      // игроку форма фракции открывается с правкой только описания
      items.push({ label: "Редактировать фракцию", onSelect: () => this.#openFactionPanel(factionId) });
    }

    // У узла и связи своё меню — создание узла и общие списки там лишние.
    if (target.kind === "faction" || target.kind === "background") {
      const factionId = target.kind === "faction" ? target.id : null;
      items.push({
        label: "Добавить узел",
        onSelect: () => {
          void this.#createNode(client, factionId);
        },
      });
      items.push({ label: "Фракции…", onSelect: () => this.#openFactionList() });
      items.push({ label: "Типы связей…", onSelect: () => this.#openRelationshipTypeList() });
      items.push({ label: "Состояния…", onSelect: () => this.#openConditionList() });
    }

    items.push({ label: "Показать весь граф", onSelect: () => this.#cy?.fit(undefined, 30) });
    if (this.#cy?.$(":selected").nonempty()) {
      items.push({ label: "Снять выделение", onSelect: () => this.#cy?.$(":selected").unselect() });
    }

    this.#overlays?.showMenu(client, items);
  }

  /** Мержит снэпшот x/y/scale от interaction.ts в текущий GraphData и сохраняет целиком. */
  async #persistNodeChanges(snapshots: NodeSnapshot[]): Promise<void> {
    if (!this.#currentData) return;

    const byId = new Map(snapshots.map((s) => [s.id, s]));
    const nodes: GraphNode[] = this.#currentData.nodes.map((n) => {
      const s = byId.get(n.id);
      return s ? { ...n, x: s.x, y: s.y, scale: s.scale } : n;
    });

    this.#currentData = { ...this.#currentData, nodes };
    await saveGraphData(this.#currentData);
  }

  async close(options?: unknown): Promise<this> {
    this.#interaction?.teardown();
    this.#interaction = null;
    this.#overlays?.destroy();
    this.#overlays = null;
    this.#decor?.destroy();
    this.#decor = null;
    this.#edgeLabels?.destroy();
    this.#edgeLabels = null;
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
