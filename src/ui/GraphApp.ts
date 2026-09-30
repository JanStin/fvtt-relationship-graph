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
import { describeFaction, describeNode } from "../core/describe";
import type { Point } from "../core/hit-test";
import { renderGraph } from "./graph-renderer";
import { setupInteraction, type GraphTarget, type InteractionHandle, type NodeSnapshot } from "./interaction";
import { createOverlays, type MenuItem, type Overlays } from "./overlays";
import { createImportControl } from "./panels/ImportDialog";

declare const foundry: any;
declare const game: any;

const EMPTY_GRAPH: GraphData = { nodes: [], edges: [], factions: [], relationshipTypes: [] };

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
    cyHost.style.cssText = "flex:1 1 auto;min-height:0;background:#16213e;";

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

  #display(data: GraphData): void {
    if (!this.#cyHost) return;

    const hydrated: GraphData = { ...data, nodes: syncNodesWithActors(data.nodes) };
    this.#currentData = hydrated;

    this.#interaction?.teardown();
    this.#overlays?.destroy();
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
    this.#cy = renderGraph(this.#cyHost, hydrated);
    this.#interaction.bind(this.#cy);

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(this.#cyHost);
  }

  #openInfo(target: GraphTarget, client: Point): void {
    if (!this.#currentData || target.kind === "background") return;
    const card =
      target.kind === "node"
        ? describeNode(this.#currentData, target.id, { isGM: game.user?.isGM === true })
        : describeFaction(this.#currentData, target.id);
    if (card) this.#overlays?.showInfo(client, card);
  }

  #openContextMenu(target: GraphTarget, client: Point): void {
    const items: MenuItem[] = [];

    if (target.kind === "node") {
      const nodeId = target.id;
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      const actorId = this.#currentData?.nodes.find((n) => n.id === nodeId)?.actorId;
      const actor = actorId ? game.actors?.get(actorId) : null;
      if (actor) items.push({ label: "Открыть лист актёра", onSelect: () => actor.sheet?.render(true) });
      items.push({ label: "Сбросить размер", onSelect: () => this.#interaction?.resetScale(nodeId) });
    } else if (target.kind === "faction") {
      const factionId = target.id;
      items.push({ label: "Информация", onSelect: () => this.#openInfo(target, client) });
      items.push({ label: "Выбрать область", onSelect: () => this.#interaction?.selectFaction(factionId) });
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
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cy?.destroy();
    this.#cy = null;
    this.#cyHost = null;
    this.#currentData = null;
    return super.close(options as never);
  }
}
