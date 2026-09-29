/**
 * ApplicationV2-оболочка для графа. Структурно повторяет проверенный
 * spikes/spike-foundry-app.ts (S4), но грузит реальные данные вместо фикстуры:
 * storage.loadGraphData() -> actors.syncNodesWithActors() -> graph-renderer.renderGraph().
 * Без drag/resize/rubber-band — см. src/ui/interaction.ts (будущая UI-задача).
 */

import type cytoscape from "cytoscape";
import type { GraphData } from "../core/model";
import { syncNodesWithActors } from "../foundry/actors";
import { loadGraphData, saveGraphData } from "../foundry/storage";
import { renderGraph } from "./graph-renderer";
import { createImportControl } from "./panels/ImportDialog";

declare const foundry: any;

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
  #cyHost: HTMLElement | null = null;

  async _renderHTML(): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;";

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

    this.#resizeObserver?.disconnect();
    this.#cy?.destroy();

    this.#cy = renderGraph(this.#cyHost, hydrated);
    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(this.#cyHost);
  }

  async close(options?: unknown): Promise<this> {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cy?.destroy();
    this.#cy = null;
    this.#cyHost = null;
    return super.close(options as never);
  }
}
