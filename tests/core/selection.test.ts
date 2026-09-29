import { describe, expect, it } from "vitest";
import {
  applyGroupMove,
  computeGroupMoveDeltas,
  groupScale,
  type PositionedEntity,
  type ScaledEntity,
} from "../../src/core/selection";

describe("groupScale", () => {
  it("масштабирует одиночный узел (группа из одного)", () => {
    const entities: ScaledEntity[] = [{ id: "n1", scale: 1.0 }];
    const result = groupScale(entities, "n1", 1.5);
    expect(result.get("n1")).toBeCloseTo(1.5);
  });

  it("сохраняет относительные пропорции группы", () => {
    const entities: ScaledEntity[] = [
      { id: "n1", scale: 1.0 },
      { id: "n2", scale: 2.0 },
      { id: "n3", scale: 0.5 },
    ];
    // n1: 1.0 -> 2.0, коэффициент x2
    const result = groupScale(entities, "n1", 2.0);

    expect(result.get("n1")).toBeCloseTo(2.0);
    expect(result.get("n2")).toBeCloseTo(4.0);
    expect(result.get("n3")).toBeCloseTo(1.0);
  });

  it("клампит результат каждого узла в [min, max]", () => {
    const entities: ScaledEntity[] = [
      { id: "n1", scale: 1.0 },
      { id: "n2", scale: 3.0 },
    ];
    // коэффициент x2: n1 -> 2.0 (ok), n2 -> 6.0 (клампится до max=5.0)
    const result = groupScale(entities, "n1", 2.0, { min: 0.3, max: 5.0 });

    expect(result.get("n1")).toBeCloseTo(2.0);
    expect(result.get("n2")).toBeCloseTo(5.0);
  });

  it("клампит и сам targetId, если запрошенный scale выходит за границы", () => {
    const entities: ScaledEntity[] = [{ id: "n1", scale: 1.0 }];
    expect(groupScale(entities, "n1", 100).get("n1")).toBeCloseTo(5.0);
    expect(groupScale(entities, "n1", -1).get("n1")).toBeCloseTo(0.3);
  });

  it("бросает ошибку, если targetId нет в entities", () => {
    expect(() => groupScale([{ id: "n1", scale: 1.0 }], "missing", 2.0)).toThrow();
  });
});

describe("computeGroupMoveDeltas + applyGroupMove", () => {
  it("сохраняет относительные позиции при перемещении перетаскиваемого узла", () => {
    const entities: PositionedEntity[] = [
      { id: "dragged", x: 100, y: 100 },
      { id: "friend1", x: 150, y: 100 }, // +50, 0
      { id: "friend2", x: 100, y: 180 }, // 0, +80
    ];

    const deltas = computeGroupMoveDeltas(entities, "dragged");
    const newPositions = applyGroupMove(deltas, 300, 300);

    expect(newPositions.get("dragged")).toEqual({ x: 300, y: 300 });
    expect(newPositions.get("friend1")).toEqual({ x: 350, y: 300 });
    expect(newPositions.get("friend2")).toEqual({ x: 300, y: 380 });
  });

  it("дельты, снятые один раз, дают корректный результат на нескольких последовательных тиках", () => {
    const entities: PositionedEntity[] = [
      { id: "dragged", x: 0, y: 0 },
      { id: "friend", x: 10, y: 0 },
    ];
    const deltas = computeGroupMoveDeltas(entities, "dragged");

    const tick1 = applyGroupMove(deltas, 5, 5);
    expect(tick1.get("friend")).toEqual({ x: 15, y: 5 });

    const tick2 = applyGroupMove(deltas, 20, -10);
    expect(tick2.get("friend")).toEqual({ x: 30, y: -10 });
  });

  it("группа из одного узла просто перемещается в новую точку", () => {
    const entities: PositionedEntity[] = [{ id: "solo", x: 1, y: 1 }];
    const deltas = computeGroupMoveDeltas(entities, "solo");
    expect(applyGroupMove(deltas, 42, 99).get("solo")).toEqual({ x: 42, y: 99 });
  });

  it("бросает ошибку, если draggedId нет в entities", () => {
    expect(() => computeGroupMoveDeltas([{ id: "a", x: 0, y: 0 }], "missing")).toThrow();
  });
});
