/**
 * Заливка областей фракций органическими формами (геометрия — core/blob.ts). Рисуется на
 * своём канвасе под канвасом Cytoscape; compound-узлы фракций в Cytoscape остаются (они нужны
 * раскладке fcose и «Показать весь граф»), но невидимы — см. graph-renderer.ts. Узлы области
 * берутся из faction-areas.ts: в режиме "areas" узел входит в область каждой своей фракции.
 *
 * Как рисуется: для каждой фракции SDF считается на сетке экранных клеток (BLOB_CELL px)
 * в пределах видимой части её области — по всем узлам фракции сразу, чтобы перемычки между
 * соседними «островами», которые тянутся друг к другу, не обрезались. По SDF — непрозрачность
 * клетки с мягким порогом (blobCoverage). Форма полная (core/blob.blobShape): круги узлов
 * и залитое пространство внутри фигур из узлов фракции. Сетка кладётся в маленький ImageData и растягивается на канвас со
 * сглаживанием — так край получается размытым и без лесенки, а расчёт остаётся дешёвым.
 * Под каждым островом — название фракции.
 *
 * Перекрытие областей (GraphBackground.factionBlend): «наложение» — каждая область своей сеткой
 * поверх предыдущих; «смешение» — одна сетка на все области, цвет клетки — среднее цветов
 * областей в Oklab (core/color.ts), взвешенное их непрозрачностью в этой клетке.
 *
 * Перерисовка — не чаще раза за кадр: панорамирование и зум, движение и resize узлов,
 * выделение области, изменение размера окна.
 */

import type cytoscape from "cytoscape";
import {
  BLOB_SOFTNESS,
  blobBounds,
  blobCoverage,
  blobRadius,
  blobShape,
  shapeIslands,
  shapeSdf,
  type BlobShape,
  islandLabelAnchor,
  type BlobCircle,
  type BlobGroup,
  type Bounds,
} from "../core/blob";
import { mixOklab, parseHexColor, rgbToOklab, type Oklab, type Rgb } from "../core/color";
import type { FactionBlend } from "../core/model";
import { AREA_SELECTION_EVENT, areaMembers, factionAreaList, isAreaSelected, type FactionArea } from "./faction-areas";

/** Размер клетки сетки SDF в экранных px: меньше — точнее край, но дороже. */
const BLOB_CELL = 4;
/** Непрозрачность заливки: обычная и у выделенной области. */
const FILL_OPACITY = 0.2;
const SELECTED_FILL_OPACITY = 0.36;
/** Лёгкое уплотнение у самого края — чтобы форма читалась и без контура. */
const RIM_OPACITY = 0.18;
/** Шрифт названия фракции в единицах графа (как был у подписи compound-узла). */
const LABEL_FONT_SIZE = 11;
const LABEL_COLOR = "#cccccc";
/** Мельче этого (в экранных px) название не рисуем — всё равно не прочесть. */
const MIN_LABEL_SCREEN_SIZE = 5;

export interface FactionBlobLayer {
  destroy(): void;
}

/** Круги узлов области фракции. */
function circlesOf(cy: cytoscape.Core, areaId: string): BlobCircle[] {
  return areaMembers(cy, areaId).map((node) => {
    const position = node.position();
    return { x: position.x, y: position.y, radius: blobRadius(node.data("size") as number) };
  });
}

/** Области всех фракций для попадания мышью — id элемента Cytoscape и круги узлов. */
export function factionBlobGroups(cy: cytoscape.Core): BlobGroup[] {
  return factionAreaList(cy).map((area) => ({ id: area.id, circles: circlesOf(cy, area.id) }));
}

/** Область, подготовленная к одной перерисовке. */
interface PreparedArea {
  circles: BlobCircle[];
  shape: BlobShape;
  /** Рамка заливки в координатах графа. */
  bounds: Bounds;
  rgb: Rgb;
  lab: Oklab;
  opacity: number;
  label: string;
}

function prepareArea(cy: cytoscape.Core, area: FactionArea): PreparedArea | null {
  const circles = circlesOf(cy, area.id);
  if (circles.length === 0) return null;
  const shape = blobShape(circles);
  const rgb = parseHexColor(area.color);
  return {
    circles,
    shape,
    // гладкий минимум раздувает форму наружу не больше чем на k/4; залитые треугольники лежат
    // между центрами кругов — в той же рамке
    bounds: blobBounds(circles, BLOB_SOFTNESS + shape.smoothing / 4),
    rgb,
    lab: rgbToOklab(rgb),
    opacity: isAreaSelected(cy, area.id) ? SELECTED_FILL_OPACITY : FILL_OPACITY,
    label: area.label,
  };
}

/** Непрозрачность заливки области в точке графа; 0 — вне области. */
function areaAlpha(area: PreparedArea, x: number, y: number, softness: number): number {
  const { bounds } = area;
  if (x < bounds.x1 || x > bounds.x2 || y < bounds.y1 || y > bounds.y2) return 0;
  const sdf = shapeSdf({ x, y }, area.shape, softness);
  const coverage = blobCoverage(sdf, softness);
  if (coverage <= 0) return 0;
  // уплотнение у края: колокол вокруг внутренней стороны контура
  const rim = Math.exp(-(((sdf + softness * 0.5) / softness) ** 2)) * RIM_OPACITY;
  return Math.min(1, coverage * area.opacity + rim * coverage);
}

function unionBounds(areas: readonly PreparedArea[]): Bounds {
  return areas.reduce(
    (acc, area) => ({
      x1: Math.min(acc.x1, area.bounds.x1),
      y1: Math.min(acc.y1, area.bounds.y1),
      x2: Math.max(acc.x2, area.bounds.x2),
      y2: Math.max(acc.y2, area.bounds.y2),
    }),
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity },
  );
}

/** Заливает клетку: x, y — центр клетки в координатах графа, i — индекс в pixels (RGBA). */
type CellPainter = (x: number, y: number, pixels: Uint8ClampedArray, i: number) => void;

export function createFactionBlobLayer(container: HTMLElement, cy: cytoscape.Core, blend: FactionBlend): FactionBlobLayer {
  const canvas = document.createElement("canvas");
  canvas.className = "frg-blobs";
  container.prepend(canvas);
  const context = canvas.getContext("2d");
  // сетка SDF — переиспользуемый маленький канвас
  const grid = document.createElement("canvas");
  const gridContext = grid.getContext("2d");

  let frame: number | null = null;

  /** Сетка клеток в пределах видимой части рамки bounds (координаты графа). */
  function paintGrid(ctx: CanvasRenderingContext2D, bounds: Bounds, paint: CellPainter): void {
    if (!gridContext) return;
    const zoom = cy.zoom();
    const pan = cy.pan();
    const left = Math.max(0, Math.floor(pan.x + bounds.x1 * zoom));
    const top = Math.max(0, Math.floor(pan.y + bounds.y1 * zoom));
    const right = Math.min(canvas.clientWidth, Math.ceil(pan.x + bounds.x2 * zoom));
    const bottom = Math.min(canvas.clientHeight, Math.ceil(pan.y + bounds.y2 * zoom));
    if (right <= left || bottom <= top) return;

    const columns = Math.ceil((right - left) / BLOB_CELL);
    const rows = Math.ceil((bottom - top) / BLOB_CELL);
    if (grid.width !== columns || grid.height !== rows) {
      grid.width = columns;
      grid.height = rows;
    } else {
      gridContext.clearRect(0, 0, columns, rows);
    }
    const image = gridContext.createImageData(columns, rows);
    const pixels = image.data;
    for (let row = 0; row < rows; row++) {
      // центр клетки → координаты графа
      const y = (top + (row + 0.5) * BLOB_CELL - pan.y) / zoom;
      for (let column = 0; column < columns; column++) {
        const x = (left + (column + 0.5) * BLOB_CELL - pan.x) / zoom;
        paint(x, y, pixels, (row * columns + column) * 4);
      }
    }
    gridContext.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(grid, 0, 0, columns, rows, left, top, columns * BLOB_CELL, rows * BLOB_CELL);
  }

  /** Наложение: область своей сеткой поверх предыдущих. */
  function drawArea(ctx: CanvasRenderingContext2D, area: PreparedArea, softness: number): void {
    paintGrid(ctx, area.bounds, (x, y, pixels, i) => {
      const alpha = areaAlpha(area, x, y, softness);
      if (alpha <= 0) return;
      pixels[i] = area.rgb[0];
      pixels[i + 1] = area.rgb[1];
      pixels[i + 2] = area.rgb[2];
      pixels[i + 3] = Math.round(alpha * 255);
    });
  }

  /**
   * Смешение: все области одной сеткой. Цвет клетки — среднее цветов областей (Oklab),
   * взвешенное их непрозрачностью в этой клетке; непрозрачность — наибольшая из них.
   */
  function drawMixed(ctx: CanvasRenderingContext2D, areas: readonly PreparedArea[], softness: number): void {
    if (areas.length === 0) return;
    const labs = areas.map((area) => area.lab);
    const alphas = new Array<number>(areas.length).fill(0);
    paintGrid(ctx, unionBounds(areas), (x, y, pixels, i) => {
      let maxAlpha = 0;
      let covering = 0;
      let only = 0;
      for (let a = 0; a < areas.length; a++) {
        const alpha = areaAlpha(areas[a], x, y, softness);
        alphas[a] = alpha;
        if (alpha <= 0) continue;
        covering++;
        only = a;
        maxAlpha = Math.max(maxAlpha, alpha);
      }
      if (covering === 0) return;
      // одна область — её цвет как есть, без перевода туда и обратно
      const rgb = covering === 1 ? areas[only].rgb : mixOklab(labs, alphas);
      if (!rgb) return;
      pixels[i] = rgb[0];
      pixels[i + 1] = rgb[1];
      pixels[i + 2] = rgb[2];
      pixels[i + 3] = Math.round(maxAlpha * 255);
    });
  }

  function drawLabel(ctx: CanvasRenderingContext2D, circles: BlobCircle[], text: string) {
    const zoom = cy.zoom();
    const fontSize = LABEL_FONT_SIZE * zoom;
    if (!text || fontSize < MIN_LABEL_SCREEN_SIZE) return;
    const pan = cy.pan();
    const anchor = islandLabelAnchor(circles);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.fillStyle = LABEL_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(text, pan.x + anchor.x * zoom, pan.y + anchor.y * zoom + 2 * zoom);
  }

  function draw(): void {
    frame = null;
    if (!context) return;
    // размер канваса — по контейнеру, с учётом плотности пикселей экрана
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // на мелком масштабе мягкая граница не тоньше пары клеток — иначе край рябит
    const softness = Math.max(BLOB_SOFTNESS, (BLOB_CELL * 1.5) / cy.zoom());
    const areas = factionAreaList(cy)
      .map((area) => prepareArea(cy, area))
      .filter((area): area is PreparedArea => area !== null);
    const ctx = context;
    const drawLabels = (area: PreparedArea) => {
      for (const island of shapeIslands(area.shape)) {
        drawLabel(
          ctx,
          island.map((i) => area.circles[i]),
          area.label,
        );
      }
    };
    if (blend === "mix") {
      // названия — поверх общей заливки
      drawMixed(ctx, areas, softness);
      areas.forEach(drawLabels);
    } else {
      areas.forEach((area) => {
        drawArea(ctx, area, softness);
        drawLabels(area);
      });
    }
  }

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(draw);
  };

  // position — drag/раскладка/сепарация, data — resize узла, AREA_SELECTION_EVENT — подсветка
  // выбранной области
  cy.on("viewport resize", schedule);
  cy.on("position data", "node[!isFaction]", schedule);
  cy.on(AREA_SELECTION_EVENT, schedule);
  draw();

  return {
    destroy(): void {
      cy.off("viewport resize", schedule);
      cy.off("position data", "node[!isFaction]", schedule);
      cy.off(AREA_SELECTION_EVENT, schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      canvas.remove();
    },
  };
}
