import { describe, expect, it } from "vitest";
import { GraphHistory, HISTORY_LIMIT } from "../../src/core/history";
import type { GraphData } from "../../src/core/model";

/** Различимые «снимки»: граф с n фракциями. */
function snap(n: number): GraphData {
  return {
    nodes: [],
    edges: [],
    factions: Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: "", color: "", description: "" })),
    relationshipTypes: [],
    conditions: [],
  };
}

describe("GraphHistory", () => {
  it("пустая — отменять и повторять нечего", () => {
    const history = new GraphHistory();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo(snap(0))).toBeNull();
    expect(history.redo(snap(0))).toBeNull();
  });

  it("undo возвращает состояние до шага, redo — обратно", () => {
    const history = new GraphHistory();
    const s0 = snap(0);
    const s1 = snap(1);
    const s2 = snap(2);
    history.record(s0); // s0 → s1
    history.record(s1); // s1 → s2

    expect(history.undo(s2)).toBe(s1);
    expect(history.undo(s1)).toBe(s0);
    expect(history.canUndo).toBe(false);

    expect(history.redo(s0)).toBe(s1);
    expect(history.redo(s1)).toBe(s2);
    expect(history.canRedo).toBe(false);
    expect(history.undo(s2)).toBe(s1);
  });

  it("новое действие после отмены обрезает ветку повтора", () => {
    const history = new GraphHistory();
    const s0 = snap(0);
    const s1 = snap(1);
    history.record(s0);
    history.undo(s1);
    expect(history.canRedo).toBe(true);

    history.record(s0);
    expect(history.canRedo).toBe(false);
  });

  it(`хранит не больше ${HISTORY_LIMIT} шагов — старейшие забываются`, () => {
    const history = new GraphHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) history.record(snap(i));

    let current = snap(999);
    let steps = 0;
    let last: GraphData | null = null;
    while (history.canUndo) {
      last = history.undo(current);
      current = last!;
      steps++;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(last!.factions).toHaveLength(5); // snap(0..4) забыты
  });

  it("clear очищает обе ветки", () => {
    const history = new GraphHistory(3);
    history.record(snap(0));
    history.undo(snap(1));
    history.record(snap(2));
    history.clear();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });
});
