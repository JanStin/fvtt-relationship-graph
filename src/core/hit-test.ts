/**
 * Чистая геометрия для мыши: перевод координат курсора в координаты модели графа и
 * поиск области (фракции) под точкой. Не зависит от Cytoscape/DOM.
 *
 * Нужна потому, что области фракций в Cytoscape сделаны "прозрачными" для мыши
 * (events: no, см. graph-renderer.ts) — клик по области должен панорамировать вид,
 * как клик по пустому месту. Значит, попадание в область для Alt+клика, двойного
 * клика и контекстного меню приходится определять самим.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  /** Левый верхний угол контейнера графа в координатах окна (getBoundingClientRect). */
  left: number;
  top: number;
  pan: Point;
  zoom: number;
}

export interface Region {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** clientX/clientY события мыши → координаты модели графа. */
export function clientToModel(clientX: number, clientY: number, viewport: Viewport): Point {
  return {
    x: (clientX - viewport.left - viewport.pan.x) / viewport.zoom,
    y: (clientY - viewport.top - viewport.pan.y) / viewport.zoom,
  };
}

/**
 * Область под точкой или null. Если области перекрываются — выбирается наименьшая
 * по площади (в большой иначе было бы невозможно попасть по вложенной).
 */
export function findRegionAt(regions: readonly Region[], point: Point): string | null {
  let best: Region | null = null;
  let bestArea = Infinity;
  for (const region of regions) {
    const inside = point.x >= region.x1 && point.x <= region.x2 && point.y >= region.y1 && point.y <= region.y2;
    if (!inside) continue;
    const area = (region.x2 - region.x1) * (region.y2 - region.y1);
    if (area < bestArea) {
      best = region;
      bestArea = area;
    }
  }
  return best ? best.id : null;
}
