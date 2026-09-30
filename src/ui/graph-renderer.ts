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
import { parseDash } from "../core/relationship-types";
import { MODULE_ID } from "../foundry/settings";
import { EDGE_LABEL_FONT_SIZE } from "./edge-labels";

let fcoseRegistered = false;
function ensureFcoseRegistered(): void {
  if (fcoseRegistered) return;
  cytoscape.use(fcose);
  fcoseRegistered = true;
}

export const BASE_SIZE = 60; // px, scale=1.0 — используется и в interaction.ts для resize

/** Изображение узла с пустым img. В данных не хранится — подставляется только при отрисовке. */
export const DEFAULT_NODE_IMG = `modules/${MODULE_ID}/assets/placeholder-npc.png`;

const FACTION_ID_PREFIX = "faction-";
/** id compound-узла Cytoscape для фракции (чтобы не пересекаться с id обычных узлов). */
export function factionElementId(factionId: string): string {
  return `${FACTION_ID_PREFIX}${factionId}`;
}
/** Обратное к factionElementId. */
export function factionIdFromElement(elementId: string): string {
  return elementId.slice(FACTION_ID_PREFIX.length);
}
/** Класс узла-источника, пока выбирается второй узел новой связи — ставится в interaction.ts. */
export const LINK_SOURCE_CLASS = "link-source";
/** Пунктир gmOnly-связи, у типа которой линия сплошная. */
const GM_ONLY_DASH = [6, 3];
/** Класс подсветки выбранной области — ставится в interaction.ts. */
export const FACTION_SELECTED_CLASS = "faction-selected";

export interface RenderOptions {
  /** GM видит gmOnly-связи (пунктиром), игрокам они не рисуются вовсе — architecture.md §13. */
  isGM: boolean;
}

function buildElements(data: GraphData, options: RenderOptions): cytoscape.ElementDefinition[] {
  const elements: unknown[] = [];

  // Фракция без узлов не рисуется: пустой compound в Cytoscape — обычный узел в точке (0, 0).
  // Управлять такой фракцией можно через список фракций (panels/FactionPanel.ts).
  const populated = new Set(data.nodes.map((n) => n.primaryFactionId));
  data.factions.forEach((faction) => {
    if (!populated.has(faction.id)) return;
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
        parent: node.primaryFactionId ? factionElementId(node.primaryFactionId) : undefined,
        scale: node.scale,
        size,
        // Заглушка — только при пустом пути; битую ссылку не подменяем (tasks.md, B1).
        img: node.img || DEFAULT_NODE_IMG,
      },
      position: { x: node.x, y: node.y },
    });
  });

  const relationshipTypeById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt]));
  data.edges.forEach((edge) => {
    if (edge.gmOnly && !options.isGM) return;
    const relType = relationshipTypeById.get(edge.relationshipTypeId);
    // Стиль линии задаёт тип связи; gmOnly-связь всегда пунктирная и полупрозрачная —
    // так GM отличит её и от связи пунктирного типа.
    const dashPattern = parseDash(relType?.dash ?? "") ?? (edge.gmOnly ? GM_ONLY_DASH : null);
    elements.push({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        // место подписи на связи; настоящее значение сразу после рендера ставит edge-labels.ts
        labelOffset: 0,
        arrow: edge.directional ? "triangle" : "none",
        edgeColor: relType?.color ?? "#64748b",
        lineStyle: dashPattern ? "dashed" : "solid",
        ...(dashPattern ? { dashPattern } : {}),
        edgeOpacity: edge.gmOnly ? 0.6 : 1,
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
      // запас под HTML-подписи узлов: compound bbox про них не знает
      padding: "30px",
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
      "background-image": "data(img)",
      "background-fit": "cover",
      // подписи у узла нет: имя, роль и бейджи рисует HTML-слой (node-decor.ts)
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
      "line-opacity": "data(edgeOpacity)",
      "curve-style": "bezier",
      // Подпись — source-label: её можно двигать вдоль связи (source-text-offset), чтобы
      // подписи соседних связей не накладывались (edge-labels.ts).
      "source-label": "data(label)",
      "source-text-offset": "data(labelOffset)",
      "font-size": EDGE_LABEL_FONT_SIZE,
      color: "#f8fafc",
      // тёмная подложка — текст читается поверх линии любого цвета
      "text-background-color": "#0f172a",
      "text-background-opacity": 0.8,
      "text-background-padding": "2px",
      "text-background-shape": "roundrectangle",
    },
  },
  {
    selector: "edge[dashPattern]",
    style: {
      "line-dash-pattern": (edge: cytoscape.EdgeSingular) => edge.data("dashPattern") as number[],
    },
  },
  {
    selector: `node.${LINK_SOURCE_CLASS}`,
    style: {
      "border-width": 4,
      "border-color": "#38bdf8",
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
