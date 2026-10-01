/**
 * Чистая геометрия для мыши: перевод координат курсора в координаты модели графа.
 * Не зависит от Cytoscape/DOM.
 *
 * Области фракций в Cytoscape сделаны "прозрачными" для мыши (events: no, см.
 * graph-renderer.ts) — клик по области должен панорамировать вид, как клик по пустому
 * месту. Попадание в область для Alt+клика, двойного клика и контекстного меню
 * определяется по её форме — core/blob.ts (findBlobAt).
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

/** clientX/clientY события мыши → координаты модели графа. */
export function clientToModel(clientX: number, clientY: number, viewport: Viewport): Point {
  return {
    x: (clientX - viewport.left - viewport.pan.x) / viewport.zoom,
    y: (clientY - viewport.top - viewport.pan.y) / viewport.zoom,
  };
}
