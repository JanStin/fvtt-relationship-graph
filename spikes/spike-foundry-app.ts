// S4 spike: does an ApplicationV2 window give us a workable container for Cytoscape?
//
// This does NOT go through the raw <script> global hack used by spike-layout.html /
// spike-resize.html — it's bundled by Vite like real module code, so cytoscape/fcose
// are proper ESM imports here. That's also what's being tested: does the bundler
// resolve the CJS-style cose-base/layout-base deps correctly inside module.js.
//
// Not wired to a Scene Controls button on purpose — that's a separate
// "Foundry-интеграция" task. Triggered manually for this spike, see src/main.ts.

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

declare const foundry: any;

cytoscape.use(fcose);

const BASE_SIZE = 60;

const FACTIONS = [
  { id: "f-zentarim", label: "Зентарим", color: "#6366f1" },
  { id: "f-church", label: "Церковь Тира", color: "#f97316" },
];

const NODES_DATA = [
  { id: "n01", label: "Артадель", faction: "f-zentarim", scale: 1.0 },
  { id: "n02", label: "Дирк", faction: "f-zentarim", scale: 1.5 },
  { id: "n03", label: "Дрейк", faction: "f-zentarim", scale: 0.75 },
  { id: "n04", label: "Кора", faction: "f-church", scale: 1.0 },
  { id: "n05", label: "Перегрин", faction: "f-church", scale: 2.0 },
  { id: "n06", label: "Аспид", faction: null, scale: 1.0 },
];

function buildElements() {
  const elements: unknown[] = [];
  FACTIONS.forEach((f) => {
    elements.push({ data: { id: f.id, label: f.label, isFaction: true, factionColor: f.color } });
  });
  NODES_DATA.forEach((n) => {
    const size = BASE_SIZE * n.scale;
    elements.push({
      data: { id: n.id, label: n.label, parent: n.faction ?? undefined, scale: n.scale, size },
    });
  });
  return elements;
}

const ApplicationV2 = foundry.applications.api.ApplicationV2;

export class SpikeGraphApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "fvtt-relationship-graph-spike-s4",
    window: {
      title: "S4: ApplicationV2 + Cytoscape",
      resizable: true,
      icon: "fa-solid fa-diagram-project",
    },
    position: {
      width: 900,
      height: 650,
    },
  };

  #cy: cytoscape.Core | null = null;
  #resizeObserver: ResizeObserver | null = null;

  async _renderHTML(): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;display:flex;flex-direction:column;";

    const status = document.createElement("div");
    status.className = "spike-s4-status";
    status.style.cssText =
      "padding:6px 10px;font-size:12px;background:#222;color:#4ade80;flex:0 0 auto;";
    status.textContent = "Инициализация Cytoscape…";

    const cyHost = document.createElement("div");
    cyHost.style.cssText = "flex:1 1 auto;min-height:0;background:#16213e;";

    wrapper.appendChild(status);
    wrapper.appendChild(cyHost);

    // Stash refs for _replaceHTML — ApplicationV2 renders detached from the DOM
    // first, so Cytoscape can't measure the container until it's actually attached.
    (wrapper as any)._cyHost = cyHost;
    (wrapper as any)._status = status;

    return wrapper;
  }

  async _replaceHTML(result: HTMLElement, content: HTMLElement): Promise<void> {
    content.replaceChildren(result);

    const cyHost = (result as any)._cyHost as HTMLElement;
    const status = (result as any)._status as HTMLElement;

    // Wait a frame so the element has real layout dimensions inside the
    // Foundry window before Cytoscape reads them.
    requestAnimationFrame(() => {
      try {
        this.#initGraph(cyHost);
        status.textContent = "✅ Cytoscape смонтирован внутри ApplicationV2";
        status.style.color = "#4ade80";
      } catch (err) {
        status.textContent = `❌ Ошибка: ${(err as Error).message}`;
        status.style.color = "#f87171";
        console.error("fvtt-relationship-graph | spike S4 init failed", err);
      }
    });
  }

  #initGraph(cyHost: HTMLElement) {
    this.#cy = cytoscape({
      container: cyHost,
      elements: buildElements() as unknown as cytoscape.ElementDefinition[],
      style: [
        {
          selector: "node[?isFaction]",
          style: {
            shape: "round-rectangle",
            "background-color": "data(factionColor)",
            "background-opacity": 0.15,
            "border-width": 2,
            "border-color": "data(factionColor)",
            label: "data(label)",
            "text-valign": "bottom",
            "font-size": 11,
            color: "#ccc",
            padding: "20px",
          },
        },
        {
          selector: "node[!isFaction]",
          style: {
            width: "data(size)",
            height: "data(size)",
            "background-color": "#334155",
            "border-width": 2,
            "border-color": "#64748b",
            label: "data(label)",
            "text-valign": "center",
            "font-size": 9,
            color: "#e2e8f0",
          },
        },
      ],
      layout: {
        name: "fcose",
        animate: true,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
      } as unknown as cytoscape.LayoutOptions,
    });

    // Foundry windows are resizable by the user — Cytoscape needs an explicit
    // resize() call or the canvas stays the size it was first drawn at.
    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize());
    this.#resizeObserver.observe(cyHost);
  }

  async close(options?: unknown): Promise<this> {
    this.#resizeObserver?.disconnect();
    this.#cy?.destroy();
    this.#cy = null;
    return super.close(options as never);
  }
}
