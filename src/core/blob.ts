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
 */

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
 * минимум как раз опускается до нуля. Возвращает индексы кругов по островам.
 */
export function blobIslands(circles: readonly BlobCircle[], smoothing = blobSmoothing(circles)): number[][] {
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

/**
 * Область под точкой или null. Попадание — внутри контура (SDF ≤ 0). Если точка внутри
 * нескольких областей — выбирается та, в которую она погружена глубже.
 */
export function findBlobAt(groups: readonly BlobGroup[], point: Point): string | null {
  let best: string | null = null;
  let bestDistance = 0;
  for (const group of groups) {
    const distance = blobSdf(point, group.circles, blobSmoothing(group.circles));
    if (distance <= bestDistance) {
      best = group.id;
      bestDistance = distance;
    }
  }
  return best;
}
