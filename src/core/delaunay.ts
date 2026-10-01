/**
 * Триангуляция Делоне (алгоритм Боуэра — Уотсона, O(n²)). Нужна альфа-форме областей
 * фракций (core/blob.ts): узлов во фракции десятки, так что простой алгоритм быстрее любого
 * подключения библиотеки.
 */

import type { Point } from "./hit-test";

/** Треугольник — индексы трёх точек входного массива. */
export type Triangle = [number, number, number];

interface Circumcircle {
  x: number;
  y: number;
  radiusSquared: number;
}

function circumcircle(a: Point, b: Point, c: Point): Circumcircle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null; // точки на одной прямой
  const a2 = a.x * a.x + a.y * a.y;
  const b2 = b.x * b.x + b.y * b.y;
  const c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, radiusSquared: (a.x - x) ** 2 + (a.y - y) ** 2 };
}

/**
 * Треугольники Делоне для набора точек. Меньше трёх точек, все на одной прямой — пустой
 * список. Совпадающие точки учитываются один раз (остальные копии в треугольники не входят).
 */
export function delaunay(points: readonly Point[]): Triangle[] {
  if (points.length < 3) return [];

  // объемлющий «супертреугольник» — его вершины в конце массива и в результат не попадают
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const all: Point[] = [...points, { x: cx - size, y: cy - size }, { x: cx + size, y: cy - size }, { x: cx, y: cy + size }];
  const n = points.length;

  type Entry = { t: Triangle; circle: Circumcircle };
  let triangles: Entry[] = [];
  const add = (t: Triangle) => {
    const circle = circumcircle(all[t[0]], all[t[1]], all[t[2]]);
    if (circle) triangles.push({ t, circle });
  };
  add([n, n + 1, n + 2]);

  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const p = all[i];
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // треугольники, в чью описанную окружность попала точка, удаляются; их внешние рёбра
    // образуют «дыру», которую заполняют новые треугольники с вершиной в точке
    const bad: Entry[] = [];
    const kept: Entry[] = [];
    for (const entry of triangles) {
      const dx = p.x - entry.circle.x;
      const dy = p.y - entry.circle.y;
      (dx * dx + dy * dy <= entry.circle.radiusSquared ? bad : kept).push(entry);
    }
    const edgeCount = new Map<string, [number, number]>();
    const counts = new Map<string, number>();
    for (const { t } of bad) {
      for (const [u, v] of [
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ]) {
        const edgeKey = u < v ? `${u}-${v}` : `${v}-${u}`;
        edgeCount.set(edgeKey, [u, v]);
        counts.set(edgeKey, (counts.get(edgeKey) ?? 0) + 1);
      }
    }
    triangles = kept;
    edgeCount.forEach(([u, v], edgeKey) => {
      if (counts.get(edgeKey) === 1) add([u, v, i]);
    });
  }

  return triangles.map((entry) => entry.t).filter((t) => t.every((index) => index < n));
}
