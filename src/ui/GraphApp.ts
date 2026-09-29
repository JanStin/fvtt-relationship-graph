/**
 * ApplicationV2-оболочка для графа. Структурно повторяет проверенный
 * spikes/spike-foundry-app.ts (S4), но грузит реальные данные вместо фикстуры:
 * storage.loadGraphData() -> actors.syncNodesWithActors() -> graph-renderer.renderGraph().
 * Без drag/resize/rubber-band — см. src/ui/interaction.ts (будущая UI-задача).
 */

import type cytoscape from "cytoscape";
import type { GraphData } from "../core/model";
import { syncNodesWithActors } from "../foundry/actors";
import { loadGraphData } from "../foundry/storage";
import { renderGraph } from "./graph-renderer";

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

  async _renderHTML(): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;";

    const cyHost = document.createElement("div");
    cyHost.style.cssText = "width:100%;height:100%;background:#16213e;";
    wrapper.appendChild(cyHost);

    (wrapper as unknown as { _cyHost: HTMLElement })._cyHost = cyHost;
    return wrapper;
  }

  async _replaceHTML(result: HTMLElement, content: HTMLElement): Promise<void> {
    content.replaceChildren(result);
    const cyHost = (result as unknown as { _cyHost: HTMLElement })._cyHost;

    // Ждём кадр, чтобы элемент реально встроился в DOM окна до того, как
    // Cytoscape попытается измерить его размеры (см. находки S4).
    requestAnimationFrame(() => {
      this.#mount(cyHost).catch((err: unknown) => {
        console.error("fvtt-relationship-graph | GraphApp mount failed", err);
      });
    });
  }

  async #mount(cyHost: HTMLElement): Promise<void> {
    const stored = await loadGraphData();
    const data = stored ?? EMPTY_GRAPH;
    const hydrated: GraphData = { ...data, nodes: syncNodesWithActors(data.nodes) };

    this.#cy = renderGraph(cyHost, hydrated);

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(cyHost);
  }

  async close(options?: unknown): Promise<this> {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#cy?.destroy();
    this.#cy = null;
    return super.close(options as never);
  }
}
