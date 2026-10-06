/**
 * Тонкий рендер графа: инициализация Cytoscape из GraphData. Сохранённые координаты узлов
 * (GraphNode.x/y) уважаются как есть (layout: preset); fcose запускается только когда
 * позиций ещё нет вообще.
 * Без drag/resize/rubber-band — та интерактивность добавляется в interaction.ts (UI-задачи).
 * Области фракций "прозрачны" для мыши (events: no + selectable/grabbable: false): клик по
 * области ведёт себя как клик по пустому месту (панорамирование), а попадание в область
 * interaction.ts определяет сам по форме области (core/blob.ts).
 * Сами области Cytoscape не рисует: compound-узлы фракций невидимы, заливку органической
 * формой и название рисует faction-blobs.ts. Кто в какой области — не дети compound-узла,
 * а набор из faction-areas.ts: в режиме "areas" узел входит и в области дополнительных фракций.
 * Стили/layout проверены спайками S1/S3 (docs/architecture.md §10).
 */

import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import { factionName } from "../core/edit";
import { factionAreas } from "../core/faction-areas";
import { imageAlignPosition } from "../core/image-align";
import type { GraphData } from "../core/model";
import { cytoscapeImageFit, normalizeImageFit, type Size } from "../core/node-image";
import { canEditNode } from "../core/permissions";
import { edgeLabelFontSize } from "../core/label-layout";
import { parseDash } from "../core/relationship-types";
import { isMasked } from "../core/visibility";
import { ZOOM_MAX, ZOOM_MIN } from "../core/zoom";
import { MODULE_ID } from "../foundry/settings";
import { setFactionAreas } from "./faction-areas";

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
/** Элемент не подходит под запрос открытой панели поиска — приглушён (GraphApp). */
export const DIMMED_CLASS = "frg-dimmed";
/** Рамка узла без фракции (и линия связи без типа). */
const NEUTRAL_COLOR = "#64748b";
/** Пунктир gmOnly-связи, у типа которой линия сплошная. */
const GM_ONLY_DASH = [6, 3];

export interface RenderOptions {
  /** false — режим просмотра: узлы не перетаскиваются вовсе. */
  editable: boolean;
  /**
   * GM видит gmOnly-связи (пунктиром), игрокам они не рисуются вовсе; hidden-узел игроку
   * рисуется картинкой-заглушкой — architecture.md §13. gmOnly-узлы игрок не двигает.
   */
  isGM: boolean;
  /** CSS font-family подписей связей (core/background.ts, graphFontFamily). */
  fontFamily: string;
}

function buildElements(data: GraphData, options: RenderOptions): cytoscape.ElementDefinition[] {
  const elements: unknown[] = [];

  // Фракция без узлов не рисуется: пустой compound в Cytoscape — обычный узел в точке (0, 0).
  // Управлять такой фракцией можно через список фракций (panels/FactionPanel.ts).
  const populated = new Set(data.nodes.map((n) => n.primaryFactionId));
  data.factions.forEach((faction) => {
    if (!populated.has(faction.id)) return;
    elements.push({
      data: { id: factionElementId(faction.id), label: factionName(faction), isFaction: true, factionColor: faction.color },
      selectable: false,
      grabbable: false,
    });
  });

  const factionColorById = new Map(data.factions.map((f) => [f.id, f.color]));
  data.nodes.forEach((node) => {
    const size = BASE_SIZE * node.scale;
    // Узел, который пользователь не может трогать (у игрока — gmOnly): не перетаскивается,
    // в том числе в группе выделенных; interaction.ts по флагу pinned не ресайзит его и не
    // сдвигает сепарацией.
    const pinned = !canEditNode(node, options.isGM);
    elements.push({
      grabbable: !pinned,
      data: {
        id: node.id,
        parent: node.primaryFactionId ? factionElementId(node.primaryFactionId) : undefined,
        scale: node.scale,
        size,
        pinned,
        // Заглушка — только при пустом пути; битую ссылку не подменяем.
        // Скрытый узел игроку всегда рисуется заглушкой.
        img: (isMasked(node, options.isGM) ? "" : node.img) || DEFAULT_NODE_IMG,
        // картинка заполняет узел (cover), лишнее обрезается по одной оси — с какой стороны, задаёт узел
        imgPosition: imageAlignPosition(node.imageAlign),
        imageFit: normalizeImageFit(node.imageFit),
        // рамка — цвет основной фракции (она и так видна всем областью), без фракции — нейтральная
        borderColor: (node.primaryFactionId && factionColorById.get(node.primaryFactionId)) || NEUTRAL_COLOR,
      },
      position: { x: node.x, y: node.y },
    });
  });

  const relationshipTypeById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt]));
  const scaleById = new Map(data.nodes.map((n) => [n.id, n.scale]));
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
        // шрифт подписи растёт с узлами; после resize его обновляет edge-labels.ts
        labelFontSize: edgeLabelFontSize(scaleById.get(edge.source) ?? 1, scaleById.get(edge.target) ?? 1),
        arrow: edge.directional ? "triangle" : "none",
        edgeColor: relType?.color ?? NEUTRAL_COLOR,
        lineStyle: dashPattern ? "dashed" : "solid",
        ...(dashPattern ? { dashPattern } : {}),
        edgeOpacity: edge.gmOnly ? 0.6 : 1,
      },
    });
  });

  return elements as cytoscape.ElementDefinition[];
}

function imageFitOf(node: cytoscape.NodeSingular) {
  return cytoscapeImageFit(
    node.data("imageFit"),
    node.data("size") as number,
    (node.data("imgNatural") as Size | undefined) ?? null,
  );
}

/** Натуральные размеры уже загруженных картинок: при перерисовке графа scale-down не мигает. */
const naturalSizes = new Map<string, Size>();

/**
 * Узлам scale-down нужен натуральный размер картинки: загружаем её сами (Cytoscape размер не
 * отдаёт) и кладём в data.imgNatural — функция стиля пересчитается. Не загрузилась — остаётся contain.
 */
function provideNaturalSizes(cy: cytoscape.Core): void {
  const pending = new Map<string, cytoscape.NodeSingular[]>();
  cy.nodes("[!isFaction]").forEach((node) => {
    if (node.data("imageFit") !== "scale-down") return;
    const url = node.data("img") as string;
    const known = naturalSizes.get(url);
    if (known) node.data("imgNatural", known);
    else pending.set(url, [...(pending.get(url) ?? []), node]);
  });
  pending.forEach((nodes, url) => {
    const image = new Image();
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      naturalSizes.set(url, size);
      if (cy.destroyed()) return;
      cy.batch(() => nodes.forEach((node) => node.data("imgNatural", size)));
    };
    image.src = url;
  });
}

// @types/cytoscape не типизирует data()-мапперы для enum-подобных свойств (arrow-shape и т.д.),
// хотя рантайм их прекрасно принимает (стандартный cytoscape API) — строим как plain array,
// приводим тип на использовании.
const STYLE = [
  {
    // Невидимый compound: нужен раскладке fcose и для рамки графа («Показать весь граф»).
    // Заливку, название и подсветку выбранной области рисует faction-blobs.ts.
    selector: "node[?isFaction]",
    style: {
      "background-opacity": 0,
      "border-width": 0,
      // запас под заливку области (faction-blobs.ts) — она шире узлов; иначе «Показать весь
      // граф» обрезал бы её края. Compound bbox про неё не знает.
      padding: "90px",
      events: "no",
    },
  },
  {
    selector: "node[!isFaction]",
    style: {
      width: "data(size)",
      height: "data(size)",
      "background-color": "#334155",
      "border-width": 2,
      "border-color": "data(borderColor)",
      "background-image": "data(img)",
      // как CSS object-fit (core/node-image.ts); scale-down смотрит на натуральный размер файла —
      // его renderGraph кладёт в data.imgNatural, когда картинка загрузится
      "background-fit": (node: cytoscape.NodeSingular) => imageFitOf(node).fit,
      "background-width": (node: cytoscape.NodeSingular) => (imageFitOf(node).stretch ? "100%" : "auto"),
      "background-height": (node: cytoscape.NodeSingular) => (imageFitOf(node).stretch ? "100%" : "auto"),
      "background-position-x": (node: cytoscape.NodeSingular) => (node.data("imgPosition") as { x: string }).x,
      "background-position-y": (node: cytoscape.NodeSingular) => (node.data("imgPosition") as { y: string }).y,
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
      "font-size": "data(labelFontSize)",
      color: "#000000",
      // белая подложка — текст читается поверх линии любого цвета
      "text-background-color": "#ffffff",
      "text-background-opacity": 1,
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
  {
    // последним — приглушает узел или связь вместе с подписью поверх остальных стилей
    selector: `.${DIMMED_CLASS}`,
    style: {
      opacity: 0.2,
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

  const cy = cytoscape({
    container,
    boxSelectionEnabled: true, // Shift+ЛКМ-drag — rubber-band, нативное поведение Cytoscape, см. §6
    autoungrabify: !options.editable,
    // те же пределы у колеса и у ползунка масштаба (zoom-control.ts)
    minZoom: ZOOM_MIN,
    maxZoom: ZOOM_MAX,
    elements: buildElements(data, options),
    style: [...STYLE, { selector: "edge", style: { "font-family": options.fontFamily } }] as cytoscape.StylesheetStyle[],
    layout,
  });
  provideNaturalSizes(cy);
  const factionById = new Map(data.factions.map((f) => [f.id, f]));
  setFactionAreas(
    cy,
    factionAreas(data).map((area) => {
      const faction = factionById.get(area.factionId);
      return {
        id: factionElementId(area.factionId),
        label: faction ? factionName(faction) : "",
        color: faction?.color ?? "",
        nodeIds: area.nodeIds,
      };
    }),
  );
  return cy;
}
