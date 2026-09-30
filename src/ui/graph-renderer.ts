/**
 * Тонкий рендер графа: инициализация Cytoscape из GraphData. Сохранённые координаты узлов
 * (GraphNode.x/y) уважаются как есть (layout: preset); fcose запускается только когда
 * позиций ещё нет вообще.
 * Без drag/resize/rubber-band — та интерактивность добавляется в interaction.ts (UI-задачи).
 * Области фракций "прозрачны" для мыши (events: no + selectable/grabbable: false): клик по
 * области ведёт себя как клик по пустому месту (панорамирование), а попадание в область
 * interaction.ts определяет сам через core/hit-test.ts.
 * Стили/layout взяты из проверенных spikes/spike-layout.html и spikes/spike-resize.html.
 */

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import type { GraphData } from "../core/model";

let fcoseRegistered = false;
function ensureFcoseRegistered(): void {
  if (fcoseRegistered) return;
  cytoscape.use(fcose);
  fcoseRegistered = true;
}

export const BASE_SIZE = 60; // px, scale=1.0 — используется и в interaction.ts для resize

const FACTION_ID_PREFIX = "faction-";
/** id compound-узла Cytoscape для фракции (чтобы не пересекаться с id обычных узлов). */
export function factionElementId(factionId: string): string {
  return `${FACTION_ID_PREFIX}${factionId}`;
}
/** Обратное к factionElementId. */
export function factionIdFromElement(elementId: string): string {
  return elementId.slice(FACTION_ID_PREFIX.length);
}
/** Класс подсветки выбранной области — ставится в interaction.ts. */
export const FACTION_SELECTED_CLASS = "faction-selected";

export interface RenderOptions {
  /** GM видит gmOnly-связи (пунктиром), игрокам они не рисуются вовсе — architecture.md §13. */
  isGM: boolean;
}

function buildElements(data: GraphData, options: RenderOptions): cytoscape.ElementDefinition[] {
  const elements: unknown[] = [];

  data.factions.forEach((faction) => {
    elements.push({
      data: { id: factionElementId(faction.id), label: faction.name, isFaction: true, factionColor: faction.color },
      selectable: false,
      grabbable: false,
    });
  });

  data.nodes.forEach((node) => {
    const size = BASE_SIZE * node.scale;
    elements.push({
      data: {
        id: node.id,
        label: node.name,
        parent: node.primaryFactionId ? factionElementId(node.primaryFactionId) : undefined,
        scale: node.scale,
        size,
        // без картинки поле не ставим совсем — стиль с background-image висит на селекторе node[img]
        ...(node.img ? { img: node.img } : {}),
      },
      position: { x: node.x, y: node.y },
    });
  });

  const relationshipTypeById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt]));
  data.edges.forEach((edge) => {
    if (edge.gmOnly && !options.isGM) return;
    const relType = relationshipTypeById.get(edge.relationshipTypeId);
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        arrow: edge.directional ? "triangle" : "none",
        edgeColor: relType?.color ?? "#64748b",
        lineStyle: edge.gmOnly ? "dashed" : "solid",
      },
    });
  });

  return elements as cytoscape.ElementDefinition[];
}

// @types/cytoscape не типизирует data()-мапперы для enum-подобных свойств (arrow-shape и т.д.),
// хотя рантайм их прекрасно принимает (стандартный cytoscape API) — строим как plain array,
// приводим тип на использовании.
const STYLE = [
  {
    selector: "node[?isFaction]",
    style: {
      shape: "round-rectangle",
      "background-color": "data(factionColor)",
      "background-opacity": 0.15,
      "border-width": 2,
      "border-color": "data(factionColor)",
      "border-opacity": 0.8,
      label: "data(label)",
      "text-valign": "bottom",
      "text-halign": "center",
      "font-size": 11,
      color: "#ccc",
      padding: "20px",
      events: "no",
    },
  },
  {
    selector: `node.${FACTION_SELECTED_CLASS}`,
    style: {
      "background-opacity": 0.3,
      "border-width": 4,
      "border-opacity": 1,
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
      "text-halign": "center",
      "font-size": 9,
      color: "#e2e8f0",
      "text-wrap": "wrap",
      "text-max-width": "data(size)",
    },
  },
  {
    // Узел с картинкой: изображение вместо заливки, подпись уезжает под узел.
    selector: "node[img]",
    style: {
      "background-image": "data(img)",
      "background-fit": "cover",
      "text-valign": "bottom",
      "text-margin-y": 4,
      "text-max-width": 120,
    },
  },
  {
    selector: "node[!isFaction]:selected",
    style: {
      "border-width": 4,
      "border-color": "#facc15",
    },
  },
  {
    selector: "edge",
    style: {
      width: 2,
      "line-color": "data(edgeColor)",
      "target-arrow-color": "data(edgeColor)",
      "target-arrow-shape": "data(arrow)",
      "line-style": "data(lineStyle)",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 8,
      color: "#cbd5e1",
    },
  },
  {
    selector: "edge:selected",
    style: {
      width: 4,
      "line-color": "#facc15",
      "target-arrow-color": "#facc15",
    },
  },
] as unknown as cytoscape.StylesheetStyle[];

// (0, 0) — дефолт для узла, у которого ещё никогда не было позиции (см. core/model.ts).
// Если хоть один узел сдвинут от (0,0), считаем, что сохранённая раскладка есть и её
// нужно уважать — иначе каждое открытие графа перетасовывало бы узлы заново (баг,
// найденный вручную: импортированные из FANG координаты игнорировались, fcose
// перезапускался при каждом рендере).
function hasStoredPositions(data: GraphData): boolean {
  return data.nodes.some((n) => n.x !== 0 || n.y !== 0);
}

/**
 * Монтирует Cytoscape в container. Если у узлов уже есть сохранённые координаты —
 * использует их как есть (layout: preset, без пересчёта). fcose запускается только
 * для графа без сохранённой раскладки (первый импорт без позиций, пустой граф).
 * Не занимается overlap-сепарацией — см. core/layout.ts.
 */
export function renderGraph(container: HTMLElement, data: GraphData, options: RenderOptions): cytoscape.Core {
  ensureFcoseRegistered();

  const layout = hasStoredPositions(data)
    ? { name: "preset" }
    : ({
        name: "fcose",
        animate: true,
        nodeDimensionsIncludeLabels: false,
        nodeRepulsion: () => 8000,
        idealEdgeLength: () => 100,
        gravity: 0.25,
        tilingPaddingVertical: 20,
        tilingPaddingHorizontal: 20,
        nodeSeparation: 30,
      } as unknown as cytoscape.LayoutOptions);

  return cytoscape({
    container,
    boxSelectionEnabled: true, // Shift+ЛКМ-drag — rubber-band, нативное поведение Cytoscape, см. §6
    elements: buildElements(data, options),
    style: STYLE,
    layout,
  });
}
