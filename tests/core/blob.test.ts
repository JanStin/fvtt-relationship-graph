import { describe, expect, it } from "vitest";
import {
  BLOB_SMOOTHING_FACTOR,
  blobBounds,
  blobCoverage,
  blobIslands,
  blobRadius,
  blobSdf,
  blobSmoothing,
  findBlobAt,
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
