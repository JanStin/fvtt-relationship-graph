import { describe, expect, it } from "vitest";
import { findOverlaps, separateOverlaps, type PositionedCircle } from "../../src/core/layout";

describe("findOverlaps", () => {
  it("не находит пересечений у далёких кругов", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 10 },
      { id: "b", x: 1000, y: 0, radius: 10 },
    ];
    expect(findOverlaps(circles)).toEqual([]);
  });

  it("находит пересечение и считает глубину", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 10 },
      { id: "b", x: 15, y: 0, radius: 10 }, // dist=15, minDist=20 -> depth=5
    ];
    const overlaps = findOverlaps(circles);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toMatchObject({ aId: "a", bId: "b", distance: 15, minDistance: 20, depth: 5 });
  });

  it("учитывает дополнительный gap", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 10 },
      { id: "b", x: 25, y: 0, radius: 10 }, // dist=25, minDist без gap=20 (не пересекаются)
    ];
    expect(findOverlaps(circles, 0)).toEqual([]);
    expect(findOverlaps(circles, 10)).toHaveLength(1); // с gap=10 minDist=30 > dist=25
  });
});

describe("separateOverlaps", () => {
  it("не двигает круги без пересечений", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 10 },
      { id: "b", x: 100, y: 0, radius: 10 },
    ];
    const result = separateOverlaps(circles);

    expect(result.hadOverlaps).toBe(false);
    expect(result.positions.get("a")).toEqual({ x: 0, y: 0 });
    expect(result.positions.get("b")).toEqual({ x: 100, y: 0 });
  });

  it("симметрично раздвигает два подвижных пересекающихся круга", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: -5, y: 0, radius: 10 },
      { id: "b", x: 5, y: 0, radius: 10 }, // dist=10, minDist=20, глубоко пересекаются
    ];
    const result = separateOverlaps(circles);

    expect(result.hadOverlaps).toBe(true);
    const a = result.positions.get("a")!;
    const b = result.positions.get("b")!;
    const finalDist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(finalDist).toBeCloseTo(20, 1);
    // симметрично: центр между ними не сместился
    expect((a.x + b.x) / 2).toBeCloseTo(0, 5);

    expect(findOverlaps([...result.positions.entries()].map(([id, p]) => ({ id, ...p, radius: 10 })))).toEqual([]);
  });

  it("закреплённый узел не двигается, вся коррекция уходит на подвижный", () => {
    const circles: PositionedCircle[] = [
      { id: "anchor", x: 0, y: 0, radius: 30 },
      { id: "movable", x: 10, y: 0, radius: 30 },
    ];
    const result = separateOverlaps(circles, { anchoredIds: new Set(["anchor"]) });

    expect(result.positions.get("anchor")).toEqual({ x: 0, y: 0 });
    const movable = result.positions.get("movable")!;
    expect(Math.hypot(movable.x - 0, movable.y - 0)).toBeCloseTo(60, 1);
  });

  it("если оба узла закреплены — пересечение остаётся", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 10 },
      { id: "b", x: 5, y: 0, radius: 10 },
    ];
    const result = separateOverlaps(circles, { anchoredIds: new Set(["a", "b"]) });

    expect(result.positions.get("a")).toEqual({ x: 0, y: 0 });
    expect(result.positions.get("b")).toEqual({ x: 5, y: 0 });
    expect(result.hadOverlaps).toBe(true);
  });

  it("разруливает цепочку пересечений за несколько проходов", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 0, y: 0, radius: 20 },
      { id: "b", x: 5, y: 0, radius: 20 },
      { id: "c", x: 10, y: 0, radius: 20 },
    ];
    const result = separateOverlaps(circles);

    const final = [...result.positions.entries()].map(([id, p]) => ({ id, ...p, radius: 20 }));
    expect(findOverlaps(final)).toEqual([]);
  });

  it("не зависает на полностью совпадающих координатах", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: 50, y: 50, radius: 10 },
      { id: "b", x: 50, y: 50, radius: 10 },
    ];
    const result = separateOverlaps(circles);

    const a = result.positions.get("a")!;
    const b = result.positions.get("b")!;
    expect(a).not.toEqual(b);
    const finalDist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(finalDist).toBeCloseTo(20, 1);
  });

  it("применяет gap как дополнительный зазор после раздвигания", () => {
    const circles: PositionedCircle[] = [
      { id: "a", x: -5, y: 0, radius: 10 },
      { id: "b", x: 5, y: 0, radius: 10 },
    ];
    const result = separateOverlaps(circles, { gap: 8 });

    const a = result.positions.get("a")!;
    const b = result.positions.get("b")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(28, 1);
  });
});
