import { describe, expect, it } from "vitest";
import { groupScale, type ScaledEntity } from "../../src/core/selection";

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
