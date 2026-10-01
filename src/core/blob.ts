/**
 * Органические области фракций (blob-формы). Вокруг каждого узла фракции — круг; круги,
 * которые пересекаются или почти касаются, сливаются в одну гладкую форму без острых углов.
 * Чистая геометрия: и отрисовка (ui/faction-blobs.ts), и попадание мышью
 * (ui/interaction.ts) считаются по одной и той же функции расстояния — что видно, в то и
 * попадаешь.
 *
 * Форма — изоповерхность функции знакового расстояния (SDF): у круга это «расстояние до
 * центра минус радиус», отрицательное внутри. Круги объединяются гладким минимумом
 * (polynomial smooth min, Inigo Quilez): вблизи стыка он опускается ниже обычного min, и между
 * кругами вырастает плавная перемычка. Мягкая граница — плавный порог по тому же SDF.
 *
 * Пустое место внутри фигуры из узлов (кольцо, квадрат, любой многоугольник) заливается:
 * узлы фракции разбиваются на треугольники Делоне, отрезки не длиннее порога (alphaEdgeLimit)
 * считаются «стенами», и заливаются треугольники, до которых нельзя добраться снаружи, не
 * пересекая стену. Так замкнутая фигура со сторонами ≤ порога заливается целиком, какой бы
 * длинной ни была её диагональ. Узлы других фракций внутри фигуры не мешают — в триангуляцию
 * попадают только узлы этой фракции. Полная форма — blobShape / shapeSdf.
 */

import { delaunay } from "./delaunay";
import type { Point } from "./hit-test";

export interface BlobCircle {
  x: number;
  y: number;
  radius: number;
}

/** Область фракции для попадания мышью: id и круги её узлов. */
export interface BlobGroup {
  id: string;
  circles: readonly BlobCircle[];
}

/**
 * Сила сглаживания k относительно среднего радиуса кругов области (см. blobSmoothing).
 * Соседние области начинают тянуться друг к другу, когда зазор между кругами меньше k, и
 * сливаются, когда он не больше k / 2 (см. blobIslands).
 */
export const BLOB_SMOOTHING_FACTOR = 1;
/**
 * Порог «стены» относительно радиусов кругов: отрезок между узлами с кругами радиусов ra и rb
 * замыкает фигуру, если он не длиннее ALPHA_EDGE_FACTOR × (ra + rb) / 2.
 * У узлов обычного размера (круг ≈ 118) это ≈ 470 — около восьми размеров узла.
 */
export const ALPHA_EDGE_FACTOR = 4;
/** Ширина мягкой границы (в единицах графа): заливка гаснет на ±BLOB_SOFTNESS от контура. */
export const BLOB_SOFTNESS = 10;

/**
 * Радиус круга вокруг узла: радиус самого узла плюс отступ, всё вместе — с запасом ×2, чтобы
 * область была заметно шире узла и его подписи. Растёт вместе с узлом — под узлом его
 * подпись (HTML-слой node-decor.ts), и она тоже растёт со scale.
 */
export function blobRadius(nodeSize: number): number {
  return 2 * (nodeSize / 2 + nodeSize * 0.35 + 8);
}

/**
 * Сила сглаживания для набора кругов: пропорциональна их среднему радиусу — у крупных узлов
 * «рядом» значит дальше. Считается по всей области фракции и для отрисовки, и для попадания.
 */
export function blobSmoothing(circles: readonly BlobCircle[]): number {
  if (circles.length === 0) return 1;
  const mean = circles.reduce((sum, c) => sum + c.radius, 0) / circles.length;
  return Math.max(1, mean * BLOB_SMOOTHING_FACTOR);
}

/** Гладкий минимум: при |a − b| ≥ k — обычный min, ближе — ниже него на величину до k/4. */
export function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

/** SDF области в точке: < 0 внутри, > 0 снаружи. Без кругов — +∞. */
export function blobSdf(point: Point, circles: readonly BlobCircle[], smoothing = blobSmoothing(circles)): number {
  let distance = Infinity;
  for (const circle of circles) {
    const d = Math.hypot(point.x - circle.x, point.y - circle.y) - circle.radius;
    distance = distance === Infinity ? d : smoothMin(distance, d, smoothing);
  }
  return distance;
}

/** Непрозрачность заливки по SDF (0…1): 1 глубоко внутри, плавно гаснет у контура. */
export function blobCoverage(sdf: number, softness = BLOB_SOFTNESS): number {
  if (sdf <= -softness) return 1;
  if (sdf >= softness) return 0;
  const t = (sdf + softness) / (2 * softness);
  return 1 - t * t * (3 - 2 * t); // smoothstep
}

/**
 * Разбивает круги на «острова» — группы, которые сливаются в одну форму. Два круга
 * сливаются, когда зазор между ними не больше smoothing / 2: в середине зазора гладкий
 * минимум как раз опускается до нуля; links — дополнительно связанные пары (стороны
 * залитых треугольников, см. shapeIslands). Возвращает индексы кругов по островам.
 */
export function blobIslands(
  circles: readonly BlobCircle[],
  smoothing = blobSmoothing(circles),
  links: ReadonlyArray<readonly [number, number]> = [],
): number[][] {
  const parent = circles.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i];
      const b = circles[j];
      const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
      if (gap <= smoothing / 2) parent[find(i)] = find(j);
    }
  }
  for (const [i, j] of links) parent[find(i)] = find(j);
  const islands = new Map<number, number[]>();
  circles.forEach((_, i) => {
    const root = find(i);
    const island = islands.get(root);
    if (island) island.push(i);
    else islands.set(root, [i]);
  });
  return [...islands.values()];
}

export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Прямоугольник, в котором лежит форма (с запасом margin — под мягкую границу). */
export function blobBounds(circles: readonly BlobCircle[], margin = 0): Bounds {
  const bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const c of circles) {
    bounds.x1 = Math.min(bounds.x1, c.x - c.radius - margin);
    bounds.y1 = Math.min(bounds.y1, c.y - c.radius - margin);
    bounds.x2 = Math.max(bounds.x2, c.x + c.radius + margin);
    bounds.y2 = Math.max(bounds.y2, c.y + c.radius + margin);
  }
  return bounds;
}

/** Точка под названием фракции: по центру острова по горизонтали, у его нижнего края. */
export function islandLabelAnchor(circles: readonly BlobCircle[]): Point {
  const bounds = blobBounds(circles);
  return { x: (bounds.x1 + bounds.x2) / 2, y: bounds.y2 };
}

/** Наибольшая длина отрезка между двумя кругами, который ещё замыкает фигуру («стена»). */
export function alphaEdgeLimit(a: BlobCircle, b: BlobCircle): number {
  return (ALPHA_EDGE_FACTOR * (a.radius + b.radius)) / 2;
}

/** Залитый треугольник: индексы кругов-вершин и рамка (для быстрого отсева точек). */
export interface ShapeTriangle {
  vertices: readonly [number, number, number];
  bounds: Bounds;
}

/** Полная форма области: круги узлов, сила сглаживания и залитые треугольники между ними. */
export interface BlobShape {
  circles: readonly BlobCircle[];
  smoothing: number;
  triangles: readonly ShapeTriangle[];
}

export function blobShape(circles: readonly BlobCircle[]): BlobShape {
  const all = delaunay(circles);

  // рёбра триангуляции → треугольники по обе стороны (у ребра оболочки — один)
  const edgeKey = (i: number, j: number) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const edgesOf = ([i, j, k]: readonly number[]) => [edgeKey(i, j), edgeKey(j, k), edgeKey(k, i)];
  const sides = new Map<string, number[]>();
  all.forEach((triangle, index) => {
    for (const key of edgesOf(triangle)) {
      const list = sides.get(key);
      if (list) list.push(index);
      else sides.set(key, [index]);
    }
  });
  const isWall = (key: string) => {
    const [i, j] = key.split("-").map(Number);
    const a = circles[i];
    const b = circles[j];
    return Math.hypot(a.x - b.x, a.y - b.y) <= alphaEdgeLimit(a, b);
  };

  // снаружи — через рёбра оболочки, которые не стены; дальше — через общие рёбра-не-стены
  const outside = new Uint8Array(all.length);
  const queue: number[] = [];
  const reach = (index: number) => {
    if (outside[index]) return;
    outside[index] = 1;
    queue.push(index);
  };
  sides.forEach((list, key) => {
    if (list.length === 1 && !isWall(key)) reach(list[0]);
  });
  for (let head = 0; head < queue.length; head++) {
    for (const key of edgesOf(all[queue[head]])) {
      if (!isWall(key)) sides.get(key)?.forEach(reach);
    }
  }

  const triangles = all
    .filter((_, index) => !outside[index])
    .map((vertices) => ({ vertices, bounds: blobBounds(vertices.map((i) => ({ ...circles[i], radius: 0 }))) }));
  return { circles, smoothing: blobSmoothing(circles), triangles };
}

/** Знаковое расстояние до треугольника abc (Inigo Quilez, sdTriangle): < 0 внутри. */
export function triangleSdf(p: Point, a: Point, b: Point, c: Point): number {
  const e0x = b.x - a.x, e0y = b.y - a.y;
  const e1x = c.x - b.x, e1y = c.y - b.y;
  const e2x = a.x - c.x, e2y = a.y - c.y;
  const v0x = p.x - a.x, v0y = p.y - a.y;
  const v1x = p.x - b.x, v1y = p.y - b.y;
  const v2x = p.x - c.x, v2y = p.y - c.y;
  const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
  const t0 = clamp01((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y));
  const t1 = clamp01((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y));
  const t2 = clamp01((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y));
  const q0 = (v0x - e0x * t0) ** 2 + (v0y - e0y * t0) ** 2;
  const q1 = (v1x - e1x * t1) ** 2 + (v1y - e1y * t1) ** 2;
  const q2 = (v2x - e2x * t2) ** 2 + (v2y - e2y * t2) ** 2;
  // знак: точка по одну сторону от всех рёбер — внутри (учитывая обход вершин)
  const s = Math.sign(e0x * e2y - e0y * e2x);
  const c0 = s * (v0x * e0y - v0y * e0x);
  const c1 = s * (v1x * e1y - v1y * e1x);
  const c2 = s * (v2x * e2y - v2y * e2x);
  const distanceSquared = Math.min(q0, q1, q2);
  const inside = Math.min(c0, c1, c2) > 0;
  return inside ? -Math.sqrt(distanceSquared) : Math.sqrt(distanceSquared);
}

/** SDF полной формы: круги и залитые треугольники, объединённые гладким минимумом. */
export function shapeSdf(point: Point, shape: BlobShape, softness = BLOB_SOFTNESS): number {
  let distance = blobSdf(point, shape.circles, shape.smoothing);
  const k = shape.smoothing;
  // Треугольник дальше margin от точки не меняет ни форму, ни её мягкий край: если он дальше
  // distance + k — гладкий минимум равен distance; иначе distance и сам ≥ 2·softness, а
  // результат не меньше margin − 1.25k = 2·softness — заливка там всё равно нулевая.
  const margin = 1.25 * k + 2 * softness;
  for (const triangle of shape.triangles) {
    const b = triangle.bounds;
    if (point.x < b.x1 - margin || point.x > b.x2 + margin || point.y < b.y1 - margin || point.y > b.y2 + margin) {
      continue;
    }
    const [i, j, l] = triangle.vertices;
    const d = triangleSdf(point, shape.circles[i], shape.circles[j], shape.circles[l]);
    distance = smoothMin(distance, d, k);
  }
  return distance;
}

/** Острова полной формы: слившиеся круги плюс узлы, связанные залитыми треугольниками. */
export function shapeIslands(shape: BlobShape): number[][] {
  const links: Array<[number, number]> = [];
  for (const { vertices: [i, j, k] } of shape.triangles) links.push([i, j], [j, k]);
  return blobIslands(shape.circles, shape.smoothing, links);
}

/**
 * Область под точкой или null. Попадание — внутри контура полной формы (SDF ≤ 0), в том
 * числе в залитом пространстве между узлами. Если точка внутри нескольких областей —
 * выбирается та, в которую она погружена глубже.
 */
export function findBlobAt(groups: readonly BlobGroup[], point: Point): string | null {
  let best: string | null = null;
  let bestDistance = 0;
  for (const group of groups) {
    const distance = shapeSdf(point, blobShape(group.circles));
    if (distance <= bestDistance) {
      best = group.id;
      bestDistance = distance;
    }
  }
  return best;
}
