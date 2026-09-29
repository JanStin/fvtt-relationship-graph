/**
 * Тонкий рендер графа: инициализация Cytoscape из GraphData. Сохранённые координаты узлов
 * (GraphNode.x/y) уважаются как есть (layout: preset); fcose запускается только когда
 * позиций ещё нет вообще.
 * Без drag/resize/rubber-band — та интерактивность добавляется в interaction.ts (UI-задачи).
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

const BASE_SIZE = 60; // px, scale=1.0

function buildElements(data: GraphData): cytoscape.ElementDefinition[] {
  const elements: unknown[] = [];

  data.factions.forEach((faction) => {
    elements.push({
      data: { id: `faction-${faction.id}`, label: faction.name, isFaction: true, factionColor: faction.color },
    });
  });

  data.nodes.forEach((node) => {
    const size = BASE_SIZE * node.scale;
    elements.push({
      data: {
        id: node.id,
        label: node.name,
        parent: node.primaryFactionId ? `faction-${node.primaryFactionId}` : undefined,
        scale: node.scale,
        size,
      },
      position: { x: node.x, y: node.y },
    });
  });

  const relationshipTypeById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt]));
  data.edges.forEach((edge) => {
    const relType = relationshipTypeById.get(edge.relationshipTypeId);
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        arrow: edge.directional ? "triangle" : "none",
        edgeColor: relType?.color ?? "#64748b",
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
    selector: "edge",
    style: {
      width: 2,
      "line-color": "data(edgeColor)",
      "target-arrow-color": "data(edgeColor)",
      "target-arrow-shape": "data(arrow)",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": 8,
      color: "#cbd5e1",
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
export function renderGraph(container: HTMLElement, data: GraphData): cytoscape.Core {
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
    elements: buildElements(data),
    style: STYLE,
    layout,
  });
}
