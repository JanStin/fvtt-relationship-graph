import { describe, expect, it } from "vitest";
import { delaunay } from "../../src/core/delaunay";

describe("delaunay", () => {
  it("меньше трёх точек и точки на одной прямой — треугольников нет", () => {
    expect(delaunay([])).toEqual([]);
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
    expect(delaunay([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toEqual([]);
  });

  it("три точки — один треугольник", () => {
    const triangles = delaunay([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]);
    expect(triangles).toHaveLength(1);
    expect([...triangles[0]].sort()).toEqual([0, 1, 2]);
  });

  it("квадрат — два треугольника, вместе покрывают все вершины", () => {
    const triangles = delaunay([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 11 }, { x: 0, y: 11 }]);
    expect(triangles).toHaveLength(2);
    expect(new Set(triangles.flat())).toEqual(new Set([0, 1, 2, 3]));
  });

  it("точка внутри треугольника делит его на три", () => {
    const triangles = delaunay([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 20, y: 20 }]);
    expect(triangles).toHaveLength(3);
    expect(triangles.every((t) => t.includes(3))).toBe(true);
  });

  it("совпадающие точки учитываются один раз", () => {
    const triangles = delaunay([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 0 }]);
    expect(triangles).toHaveLength(1);
  });

  it("свойство Делоне: ни одна точка не лежит внутри описанной окружности треугольника", () => {
    // псевдослучайные точки (детерминированно)
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1000;
    const points = Array.from({ length: 40 }, () => ({ x: random(), y: random() }));
    const triangles = delaunay(points);
    expect(triangles.length).toBeGreaterThan(40);
    for (const [i, j, k] of triangles) {
      const [a, b, c] = [points[i], points[j], points[k]];
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      const a2 = a.x ** 2 + a.y ** 2;
      const b2 = b.x ** 2 + b.y ** 2;
      const c2 = c.x ** 2 + c.y ** 2;
      const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
      const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
      const r2 = (a.x - cx) ** 2 + (a.y - cy) ** 2;
      points.forEach((p, index) => {
        if (index === i || index === j || index === k) return;
        expect((p.x - cx) ** 2 + (p.y - cy) ** 2).toBeGreaterThan(r2 - 1e-6);
      });
    }
  });
});
