/**
 * Заливка областей фракций органическими формами (геометрия — core/blob.ts). Рисуется на
 * своём канвасе под канвасом Cytoscape; compound-узлы фракций в Cytoscape остаются (они нужны
 * раскладке fcose и «Показать весь граф»), но невидимы — см. graph-renderer.ts.
 *
 * Как рисуется: для каждой фракции SDF считается на сетке экранных клеток (BLOB_CELL px)
 * в пределах видимой части её области — по всем узлам фракции сразу, чтобы перемычки между
 * соседними «островами», которые тянутся друг к другу, не обрезались. По SDF — непрозрачность
 * клетки с мягким порогом (blobCoverage). Сетка кладётся в маленький ImageData и растягивается на канвас со
 * сглаживанием — так край получается размытым и без лесенки, а расчёт остаётся дешёвым.
 * Под каждым островом — название фракции.
 *
 * Перерисовка — не чаще раза за кадр: панорамирование и зум, движение и resize узлов,
 * выделение области, изменение размера окна.
 */

import type cytoscape from "cytoscape";
import {
  BLOB_SOFTNESS,
  blobBounds,
  blobCoverage,
  blobIslands,
  blobRadius,
  blobSdf,
  blobSmoothing,
  islandLabelAnchor,
  type BlobCircle,
  type BlobGroup,
} from "../core/blob";
import { FACTION_SELECTED_CLASS } from "./graph-renderer";

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

/** Круги узлов области фракции (compound-узла Cytoscape). */
function circlesOf(faction: cytoscape.NodeSingular): BlobCircle[] {
  return faction.children().map((node) => {
    const position = node.position();
    return { x: position.x, y: position.y, radius: blobRadius(node.data("size") as number) };
  });
}

/** Области всех фракций для попадания мышью — id элемента Cytoscape и круги узлов. */
export function factionBlobGroups(cy: cytoscape.Core): BlobGroup[] {
  return cy.nodes("[?isFaction]").map((faction) => ({ id: faction.id(), circles: circlesOf(faction) }));
}

/** "#rgb" / "#rrggbb" → [r, g, b]; другой формат — серый. */
function parseColor(color: string): [number, number, number] {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [136, 136, 136];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function createFactionBlobLayer(container: HTMLElement, cy: cytoscape.Core): FactionBlobLayer {
  const canvas = document.createElement("canvas");
  canvas.className = "frg-blobs";
  container.prepend(canvas);
  const context = canvas.getContext("2d");
  // сетка SDF одного острова — переиспользуемый маленький канвас
  const grid = document.createElement("canvas");
  const gridContext = grid.getContext("2d");

  let frame: number | null = null;

  /** Заливка области фракции; smoothing — её сила сглаживания (core/blob.blobSmoothing). */
  function drawArea(
    ctx: CanvasRenderingContext2D,
    circles: BlobCircle[],
    smoothing: number,
    rgb: [number, number, number],
    opacity: number,
  ) {
    if (!gridContext) return;
    const zoom = cy.zoom();
    const pan = cy.pan();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // видимая часть области на экране; гладкий минимум раздувает форму наружу не больше чем на k/4
    const bounds = blobBounds(circles, BLOB_SOFTNESS + smoothing / 4);
    const left = Math.max(0, Math.floor(pan.x + bounds.x1 * zoom));
    const top = Math.max(0, Math.floor(pan.y + bounds.y1 * zoom));
    const right = Math.min(width, Math.ceil(pan.x + bounds.x2 * zoom));
    const bottom = Math.min(height, Math.ceil(pan.y + bounds.y2 * zoom));
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
    // на мелком масштабе мягкая граница не тоньше пары клеток — иначе край рябит
    const softness = Math.max(BLOB_SOFTNESS, (BLOB_CELL * 1.5) / zoom);

    for (let row = 0; row < rows; row++) {
      // центр клетки → координаты графа
      const y = (top + (row + 0.5) * BLOB_CELL - pan.y) / zoom;
      for (let column = 0; column < columns; column++) {
        const x = (left + (column + 0.5) * BLOB_CELL - pan.x) / zoom;
        const sdf = blobSdf({ x, y }, circles, smoothing);
        const coverage = blobCoverage(sdf, softness);
        if (coverage <= 0) continue;
        // уплотнение у края: колокол вокруг внутренней стороны контура
        const rim = Math.exp(-(((sdf + softness * 0.5) / softness) ** 2)) * RIM_OPACITY;
        const alpha = Math.min(1, coverage * opacity + rim * coverage);
        const i = (row * columns + column) * 4;
        pixels[i] = rgb[0];
        pixels[i + 1] = rgb[1];
        pixels[i + 2] = rgb[2];
        pixels[i + 3] = Math.round(alpha * 255);
      }
    }
    gridContext.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(grid, 0, 0, columns, rows, left, top, columns * BLOB_CELL, rows * BLOB_CELL);
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

    cy.nodes("[?isFaction]").forEach((faction) => {
      const circles = circlesOf(faction);
      if (circles.length === 0) return;
      const rgb = parseColor((faction.data("factionColor") as string | undefined) ?? "");
      const opacity = faction.hasClass(FACTION_SELECTED_CLASS) ? SELECTED_FILL_OPACITY : FILL_OPACITY;
      const label = (faction.data("label") as string | undefined) ?? "";
      const smoothing = blobSmoothing(circles);
      drawArea(context, circles, smoothing, rgb, opacity);
      for (const island of blobIslands(circles, smoothing)) {
        drawLabel(
          context,
          island.map((i) => circles[i]),
          label,
        );
      }
    });
  }

  const schedule = () => {
    if (frame === null) frame = requestAnimationFrame(draw);
  };

  // position — drag/раскладка/сепарация, data — resize узла, class — подсветка выбранной области
  cy.on("viewport resize", schedule);
  cy.on("position data", "node[!isFaction]", schedule);
  cy.on("class", "node[?isFaction]", schedule);
  draw();

  return {
    destroy(): void {
      cy.off("viewport resize", schedule);
      cy.off("position data", "node[!isFaction]", schedule);
      cy.off("class", "node[?isFaction]", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      canvas.remove();
    },
  };
}
