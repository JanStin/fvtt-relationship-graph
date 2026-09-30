/**
 * ApplicationV2-оболочка для графа. Структурно повторяет проверенный
 * spikes/spike-foundry-app.ts (S4), но грузит реальные данные вместо фикстуры:
 * storage.loadGraphData() -> actors.syncNodesWithActors() -> graph-renderer.renderGraph()
 * -> interaction.setupInteraction() (мышь/клавиши, см. interaction.ts и docs/controls.md).
 * Контекстное меню и карточку информации (overlays.ts) наполняет этот класс.
 */

import type cytoscape from "cytoscape";
import type { GraphData, GraphNode } from "../core/model";
import { syncNodesWithActors } from "../foundry/actors";
import { loadGraphData, saveGraphData } from "../foundry/storage";
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
  createFactionFromEdit,
  type FactionEditValues,
} from "../core/edit";
import { removeEdge, removeFaction, removeNode } from "../core/graph-state";
import type { Point } from "../core/hit-test";
import { renderGraph } from "./graph-renderer";
import { setupInteraction, type GraphTarget, type InteractionHandle, type NodeSnapshot } from "./interaction";
import { createNodeDecorLayer, type NodeDecorLayer } from "./node-decor";
import { createOverlays, type MenuItem, type Overlays } from "./overlays";
import { createConditionListPanel, createConditionPanel } from "./panels/ConditionPanel";
import { createEdgePanel } from "./panels/EdgePanel";
import { createFactionListPanel, createFactionPanel } from "./panels/FactionPanel";
import { createImportControl } from "./panels/ImportDialog";
import { createNodePanel } from "./panels/NodePanel";

declare const foundry: any;
declare const game: any;

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], factions: [], relationshipTypes: [], conditions: [] };

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
    });
    this.#cy = renderGraph(this.#cyHost, hydrated, { isGM: this.#isGM });
    if (viewport) this.#cy.viewport(viewport);
    this.#interaction.bind(this.#cy);
    this.#decor = createNodeDecorLayer(this.#cyHost, this.#cy, hydrated);

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(this.#cyHost);
  }

  /** Редактировать граф может только GM: данные лежат в JournalEntry, игрок его не сохранит. */
  get #isGM(): boolean {
    return game.user?.isGM === true;
  }

  #openInfo(target: GraphTarget, client: Point): void {
    if (!this.#currentData || target.kind === "background") return;
    if (target.kind === "edge") {
      // У связи отдельной карточки нет — двойной клик сразу открывает панель (только GM).
      if (this.#isGM) this.#openEdgePanel(target.id);
      return;
    }
    const card =
      target.kind === "node"
        ? describeNode(this.#currentData, target.id, { isGM: this.#isGM })
        : describeFaction(this.#currentData, target.id);
    if (card) this.#overlays?.showInfo(client, card);
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
    await saveGraphData(data);
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

  #openNodePanel(nodeId: string): void {
    const data = this.#currentData;
    const node = data?.nodes.find((n) => n.id === nodeId);
    if (!data || !node) return;

    const panel = createNodePanel(node, data.factions, allConditions(data), {
      onSave: (values) => {
        void this.#saveNode(nodeId, values);
      },
      onDelete: () => {
        void this.#deleteNode(nodeId, node.name);
      },
      onClose: () => this.#closePanel(),
    });
    this.#mountPanel(panel);
  }

  async #saveNode(nodeId: string, values: Parameters<typeof applyNodeEdit>[2]): Promise<void> {
    if (!this.#currentData) return;
    await this.#commit(applyNodeEdit(this.#currentData, nodeId, values));
    // Размер или область могли измениться — раздвигаем соседей (позиции сохранит onNodesChanged).
    this.#interaction?.settle(nodeId);
  }

  async #deleteNode(nodeId: string, name: string): Promise<void> {
    const confirmed = await this.#confirm("Удалить узел", `Удалить узел «${name}» и все его связи?`);
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeNode(this.#currentData, nodeId));
  }

  #openEdgePanel(edgeId: string): void {
    const data = this.#currentData;
    const edge = data?.edges.find((e) => e.id === edgeId);
    if (!data || !edge) return;

    const nameOf = (id: string) => data.nodes.find((n) => n.id === id)?.name ?? "?";
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
    );
    this.#mountPanel(panel);
  }

  /** Список всех фракций (только GM) — единственный путь к фракции без узлов: её на графе нет. */
  #openFactionList(): void {
    const data = this.#currentData;
    if (!data) return;

    const panel = createFactionListPanel(
      data.factions,
      (factionId) => data.nodes.filter((n) => n.factionIds.includes(factionId)).length,
      {
        onEdit: (factionId) => this.#openFactionPanel(factionId),
        onCreate: () => this.#openFactionPanel(null),
        onClose: () => this.#closePanel(),
      },
    );
    this.#mountPanel(panel);
  }

  /** factionId === null — создание новой фракции. */
  #openFactionPanel(factionId: string | null): void {
    const data = this.#currentData;
    const faction = factionId === null ? null : data?.factions.find((f) => f.id === factionId);
    if (!data || faction === undefined) return;

    const panel = createFactionPanel(faction, {
      onSave: (values) => {
        void this.#saveFaction(factionId, values);
      },
      onDelete: () => {
        if (faction) void this.#deleteFaction(faction.id, faction.name);
      },
      onClose: () => this.#closePanel(),
    });
    this.#mountPanel(panel);
  }

  async #saveFaction(factionId: string | null, values: FactionEditValues): Promise<void> {
    if (!this.#currentData) return;
    const data =
      factionId === null
        ? createFactionFromEdit(this.#currentData, foundry.utils.randomID(), values)
        : applyFactionEdit(this.#currentData, factionId, values);
    await this.#commit(data);
    this.#openFactionList();
  }

  async #deleteFaction(factionId: string, name: string): Promise<void> {
    const confirmed = await this.#confirm(
      "Удалить фракцию",
      `Удалить фракцию «${name}»? Её узлы останутся на графе, но без этой фракции.`,
    );
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeFaction(this.#currentData, factionId));
    this.#openFactionList();
  }

  /** Справочник состояний (только GM): встроенные + свои. */
  #openConditionList(): void {
    const data = this.#currentData;
    if (!data) return;

    const panel = createConditionListPanel(
      allConditions(data),
      (conditionId) => data.nodes.filter((n) => n.conditions.includes(conditionId)).length,
      {
        onEdit: (conditionId) => this.#openConditionPanel(conditionId),
        onCreate: () => this.#openConditionPanel(null),
        onClose: () => this.#closePanel(),
      },
    );
    this.#mountPanel(panel);
  }

  /** conditionId === null — создание нового состояния. Встроенные сюда не попадают. */
  #openConditionPanel(conditionId: string | null): void {
    const data = this.#currentData;
    const condition = conditionId === null ? null : data?.conditions.find((c) => c.id === conditionId);
    if (!data || condition === undefined) return;

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

  async #deleteEdge(edgeId: string): Promise<void> {
    const confirmed = await this.#confirm("Удалить связь", "Удалить эту связь?");
    if (!confirmed || !this.#currentData) return;
    await this.#commit(removeEdge(this.#currentData, edgeId));
  }

  #openContextMenu(target: GraphTarget, client: Point): void {
    const items: MenuItem[] = [];

    if (target.kind === "node") {
      const nodeId = target.id;
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      if (this.#isGM) items.push({ label: "Редактировать", onSelect: () => this.#openNodePanel(nodeId) });
      const actorId = this.#currentData?.nodes.find((n) => n.id === nodeId)?.actorId;
      const actor = actorId ? game.actors?.get(actorId) : null;
      if (actor) items.push({ label: "Открыть лист актёра", onSelect: () => actor.sheet?.render(true) });
      items.push({ label: "Сбросить размер", onSelect: () => this.#interaction?.resetScale(nodeId) });
    } else if (target.kind === "edge") {
      const edgeId = target.id;
      if (this.#isGM) {
        items.push({ label: "Редактировать связь", onSelect: () => this.#openEdgePanel(edgeId) });
        items.push({
          label: "Удалить связь",
          onSelect: () => {
            void this.#deleteEdge(edgeId);
          },
        });
      }
    } else if (target.kind === "faction") {
      const factionId = target.id;
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      items.push({ label: "Выбрать область", onSelect: () => this.#interaction?.selectFaction(factionId) });
      if (this.#isGM) {
        items.push({ label: "Редактировать фракцию", onSelect: () => this.#openFactionPanel(factionId) });
      }
    }

    // У узла и связи своё меню — общие списки там лишние.
    if (this.#isGM && (target.kind === "faction" || target.kind === "background")) {
      items.push({ label: "Фракции…", onSelect: () => this.#openFactionList() });
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
