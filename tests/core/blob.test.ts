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
  findBlobsAt,
  shapeIslands,
  shapeSdf,
  triangleSdf,
  islandLabelSpot,
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

describe("blobBounds", () => {
  it("рамка с запасом", () => {
    expect(blobBounds([circle(0, 0), circle(30, 10)], 5)).toEqual({ x1: -15, y1: -15, x2: 45, y2: 25 });
  });
});

describe("islandLabelSpot", () => {
  // узлы обычного размера: круг области ≈ 118, препятствие (узел с подписью) — половина
  const r = 118;
  const obstacleOf = (c: BlobCircle): BlobCircle => ({ ...c, radius: c.radius / 2 });
  const spotFor = (circles: BlobCircle[], others: BlobCircle[][] = [], minClearance = 0) => {
    const shape = blobShape(circles);
    // самый крупный остров
    const [island] = shapeIslands(shape).sort((a, b) => b.length - a.length);
    return islandLabelSpot(shape, island, circles.map(obstacleOf), others.map(blobShape), minClearance);
  };

  it("у острова из 1–2 узлов названия нет", () => {
    expect(spotFor([circle(0, 0, r)])).toBeNull();
    expect(spotFor([circle(0, 0, r), circle(150, 0, r)])).toBeNull();
  });

  it("у треугольника из узлов — в центре между ними", () => {
    const spot = spotFor([circle(0, 0, r), circle(300, 0, r), circle(150, 260, r)]);
    expect(spot?.x).toBeCloseTo(150);
    expect(spot?.y).toBeCloseTo(260 / 3);
  });

  it("у вогнутой фигуры — внутри формы, а не в центре рамки", () => {
    // «уголок» L: центр рамки (300, 300) вне формы
    const corner = [
      circle(0, 0, r), circle(0, 200, r), circle(0, 400, r), circle(0, 600, r),
      circle(200, 600, r), circle(400, 600, r), circle(600, 600, r),
    ];
    const shape = blobShape(corner);
    const spot = spotFor(corner);
    expect(spot).not.toBeNull();
    expect(shapeSdf(spot!, shape)).toBeLessThan(0);
    expect(shapeSdf({ x: 300, y: 300 }, shape)).toBeGreaterThan(0);
  });

  it("у цепочки узлов без залитых треугольников — между соседними узлами", () => {
    const spot = spotFor([circle(0, 0, r), circle(200, 0, r), circle(400, 0, r)]);
    expect(spot?.y).toBeCloseTo(0);
    expect([100, 300]).toContain(spot?.x);
  });

  it("слишком тесно — без названия", () => {
    const tight = [circle(0, 0, r), circle(120, 0, r), circle(60, 104, r)];
    expect(spotFor(tight, [], 50)).toBeNull();
  });

  it("предпочитает место вне других областей", () => {
    // цепочка: середины (100, 0) и (300, 0); другая фракция накрывает левую
    const chain = [circle(0, 0, r), circle(200, 0, r), circle(400, 0, r)];
    expect(spotFor(chain, [[circle(100, -40, 60)]])?.x).toBe(300);
    expect(spotFor(chain, [[circle(300, -40, 60)]])?.x).toBe(100);
  });

  it("всё занято другими областями — всё равно лучшее место", () => {
    const chain = [circle(0, 0, r), circle(200, 0, r), circle(400, 0, r)];
    expect(spotFor(chain, [[circle(200, 0, 400)]])).not.toBeNull();
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

describe("findBlobsAt", () => {
  const groups = [
    { id: "a", circles: [circle(0, 0, 50)] },
    { id: "b", circles: [circle(40, 0, 20)] },
  ];

  it("все области под точкой — от более глубокой к менее", () => {
    expect(findBlobsAt(groups, { x: 40, y: 0 })).toEqual(["b", "a"]);
    expect(findBlobsAt(groups, { x: -20, y: 0 })).toEqual(["a"]);
    expect(findBlobsAt(groups, { x: 300, y: 300 })).toEqual([]);
  });
});
