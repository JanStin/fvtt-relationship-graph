import { describe, expect, it } from "vitest";
import {
  BLOB_SMOOTHING_FACTOR,
  blobBounds,
  blobCoverage,
  blobIslands,
  blobRadius,
  blobSdf,
  blobSmoothing,
  alphaEdgeLimit,
  blobShape,
  findBlobAt,
  shapeIslands,
  shapeSdf,
  triangleSdf,
  islandLabelAnchor,
  smoothMin,
  type BlobCircle,
} from "../../src/core/blob";

const circle = (x: number, y: number, radius = 10): BlobCircle => ({ x, y, radius });

describe("blobRadius", () => {
  it("заметно больше узла — около двух его размеров — и растёт вместе с ним", () => {
    expect(blobRadius(60)).toBeGreaterThan(100);
    expect(blobRadius(120)).toBeGreaterThan(blobRadius(60));
  });
});

describe("blobSmoothing", () => {
  it("пропорциональна среднему радиусу кругов", () => {
    expect(blobSmoothing([circle(0, 0, 10), circle(0, 0, 30)])).toBe(20 * BLOB_SMOOTHING_FACTOR);
  });

  it("у крупных узлов «рядом» — дальше", () => {
    expect(blobSmoothing([circle(0, 0, 200)])).toBeGreaterThan(blobSmoothing([circle(0, 0, 50)]));
  });
});

describe("smoothMin", () => {
  it("далёкие значения — обычный min", () => {
    expect(smoothMin(0, 100, 10)).toBe(0);
  });

  it("близкие — ниже min, но не больше чем на k/4", () => {
    expect(smoothMin(5, 5, 8)).toBeCloseTo(3);
    expect(smoothMin(3, 4, 8)).toBeLessThan(3);
  });
});

describe("blobSdf", () => {
  it("у одного круга — расстояние до окружности", () => {
    expect(blobSdf({ x: 0, y: 0 }, [circle(0, 0)])).toBe(-10);
    expect(blobSdf({ x: 25, y: 0 }, [circle(0, 0)])).toBe(15);
  });

  it("без кругов — снаружи всего", () => {
    expect(blobSdf({ x: 0, y: 0 }, [])).toBe(Infinity);
  });

  it("между близкими кругами вырастает перемычка", () => {
    // зазор 4 ≤ k / 2 (k = 10 — средний радиус) — середина зазора внутри формы
    const pair = [circle(0, 0), circle(24, 0)];
    expect(blobSdf({ x: 12, y: 0 }, pair)).toBeLessThanOrEqual(0);
  });

  it("соседние круги тянутся друг к другу ещё до слияния", () => {
    // зазор 8: больше k / 2, но меньше k — формы не слились, но край к соседу выпячивается
    const pair = [circle(0, 0), circle(28, 0)];
    const alone = blobSdf({ x: 12, y: 0 }, [circle(0, 0)]);
    expect(blobSdf({ x: 14, y: 0 }, pair)).toBeGreaterThan(0);
    expect(blobSdf({ x: 12, y: 0 }, pair)).toBeLessThan(alone);
  });

  it("далёкие круги не сливаются", () => {
    const pair = [circle(0, 0), circle(200, 0)];
    expect(blobSdf({ x: 100, y: 0 }, pair)).toBeGreaterThan(0);
  });
});

describe("blobCoverage", () => {
  it("1 внутри, 0 снаружи, плавно у контура", () => {
    expect(blobCoverage(-50, 10)).toBe(1);
    expect(blobCoverage(50, 10)).toBe(0);
    expect(blobCoverage(0, 10)).toBeCloseTo(0.5);
    expect(blobCoverage(-5, 10)).toBeGreaterThan(blobCoverage(5, 10));
  });
});

describe("blobIslands", () => {
  it("сливающиеся круги — один остров, далёкие — отдельные", () => {
    const circles = [circle(0, 0), circle(24, 0), circle(48, 0), circle(500, 0)];
    const islands = blobIslands(circles).map((island) => island.sort());
    expect(islands).toHaveLength(2);
    expect(islands).toContainEqual([0, 1, 2]);
    expect(islands).toContainEqual([3]);
  });

  it("граница слияния — зазор k / 2", () => {
    const gap = blobSmoothing([circle(0, 0)]) / 2;
    expect(blobIslands([circle(0, 0), circle(20 + gap, 0)])).toHaveLength(1);
    expect(blobIslands([circle(0, 0), circle(20 + gap + 1, 0)])).toHaveLength(2);
  });

  it("на границе слияния середина зазора действительно внутри формы", () => {
    const gap = blobSmoothing([circle(0, 0)]) / 2;
    const pair = [circle(0, 0), circle(20 + gap, 0)];
    expect(blobSdf({ x: 10 + gap / 2, y: 0 }, pair)).toBeLessThanOrEqual(1e-9);
  });
});

describe("blobBounds / islandLabelAnchor", () => {
  it("рамка с запасом", () => {
    expect(blobBounds([circle(0, 0), circle(30, 10)], 5)).toEqual({ x1: -15, y1: -15, x2: 45, y2: 25 });
  });

  it("название — по центру острова у нижнего края", () => {
    expect(islandLabelAnchor([circle(0, 0), circle(30, 10)])).toEqual({ x: 15, y: 20 });
  });
});

describe("findBlobAt", () => {
  const groups = [
    { id: "a", circles: [circle(0, 0, 50)] },
    { id: "b", circles: [circle(40, 0, 20)] },
  ];

  it("находит область по форме, а не по рамке", () => {
    expect(findBlobAt(groups, { x: 0, y: 0 })).toBe("a");
    // угол рамки круга «a» — вне круга
    expect(findBlobAt(groups, { x: -45, y: -45 })).toBeNull();
  });

  it("при перекрытии — область, в которую точка погружена глубже", () => {
    // (40, 0): в «a» на глубине 10, в «b» — на глубине 20
    expect(findBlobAt(groups, { x: 40, y: 0 })).toBe("b");
  });

  it("вне областей — null", () => {
    expect(findBlobAt(groups, { x: 300, y: 300 })).toBeNull();
    expect(findBlobAt([], { x: 0, y: 0 })).toBeNull();
  });
});

describe("triangleSdf", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };
  const c = { x: 0, y: 100 };

  it("внутри отрицательно, снаружи — расстояние до ближайшей стороны", () => {
    expect(triangleSdf({ x: 10, y: 10 }, a, b, c)).toBeCloseTo(-10);
    expect(triangleSdf({ x: 50, y: -20 }, a, b, c)).toBeCloseTo(20);
    expect(triangleSdf({ x: -30, y: -40 }, a, b, c)).toBeCloseTo(50);
  });

  it("не зависит от направления обхода вершин", () => {
    expect(triangleSdf({ x: 10, y: 10 }, a, c, b)).toBeCloseTo(-10);
  });
});

/** Узлы обычного размера (60) — круги радиуса blobRadius(60). */
const node = (x: number, y: number): BlobCircle => circle(x, y, blobRadius(60));

/** Правильный многоугольник из count узлов со стороной side вокруг (0, 0). */
function polygon(count: number, side: number): BlobCircle[] {
  const ring = side / (2 * Math.sin(Math.PI / count));
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count;
    return node(Math.cos(angle) * ring, Math.sin(angle) * ring);
  });
}

describe("заливка пространства внутри фигуры из узлов", () => {
  it("порог стороны у узлов обычного размера — около восьми размеров узла", () => {
    const limit = alphaEdgeLimit(node(0, 0), node(0, 0));
    expect(limit).toBeGreaterThan(450);
    expect(limit).toBeLessThan(500);
  });

  it("треугольник, квадрат, шестиугольник и кольцо из 12 узлов со стороной 400 — середина залита", () => {
    // у квадрата диагональ 566, у кольца из 12 — поперечник ≈ 1500: длиннее порога, но фигура замкнута
    for (const count of [3, 4, 6, 12]) {
      const shape = blobShape(polygon(count, 400));
      expect(blobSdf({ x: 0, y: 0 }, shape.circles)).toBeGreaterThan(0); // сами круги середину не закрывают
      expect(shapeSdf({ x: 0, y: 0 }, shape)).toBeLessThan(0);
    }
  });

  it("узлы дальше порога — середина пуста, фигура не замкнута", () => {
    const shape = blobShape(polygon(4, 600));
    expect(shape.triangles).toHaveLength(0);
    expect(shapeSdf({ x: 0, y: 0 }, shape)).toBeGreaterThan(0);
  });

  it("незамкнутая фигура не заливается: разрыв длиннее порога открывает её наружу", () => {
    // узлы по трём сторонам прямоугольника 900×400, верхняя сторона — разрыв 900
    const open = [node(0, 0), node(300, 0), node(600, 0), node(900, 0), node(900, 400), node(0, 400)];
    expect(shapeSdf({ x: 450, y: 250 }, blobShape(open))).toBeGreaterThan(0);
  });

  it("вогнутая фигура: залита внутри, вогнутость снаружи — нет", () => {
    // буква «Г» из узлов с шагом 400, замкнутая по контуру
    const shapeL = blobShape([
      node(0, 0),
      node(400, 0),
      node(800, 0),
      node(800, 400),
      node(400, 400),
      node(400, 800),
      node(0, 800),
      node(0, 400),
    ]);
    expect(shapeSdf({ x: 200, y: 200 }, shapeL)).toBeLessThan(0);
    expect(shapeSdf({ x: 200, y: 600 }, shapeL)).toBeLessThan(0);
    expect(shapeSdf({ x: 650, y: 650 }, shapeL)).toBeGreaterThan(0);
  });

  it("узлы, связанные треугольником, — один остров с одним названием", () => {
    const shape = blobShape(polygon(3, 400));
    expect(blobIslands(shape.circles)).toHaveLength(3); // круги сами не сливаются
    expect(shapeIslands(shape)).toHaveLength(1);
  });

  it("findBlobAt попадает в залитое пространство между узлами", () => {
    expect(findBlobAt([{ id: "square", circles: polygon(4, 400) }], { x: 0, y: 0 })).toBe("square");
  });

  it("узел другой фракции внутри фигуры важнее заливки вокруг", () => {
    const inner = { id: "inner", circles: [node(0, 0)] };
    expect(findBlobAt([{ id: "square", circles: polygon(4, 400) }, inner], { x: 0, y: 0 })).toBe("inner");
  });
});
