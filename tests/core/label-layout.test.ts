import { describe, expect, it } from "vitest";
import { estimateLabelSize, layoutEdgeLabels, type LabelEdge } from "../../src/core/label-layout";

function edge(id: string, from: [number, number], to: [number, number], overrides: Partial<LabelEdge> = {}): LabelEdge {
  return {
    id,
    source: { x: from[0], y: from[1], radius: 10 },
    target: { x: to[0], y: to[1], radius: 10 },
    labelWidth: 40,
    labelHeight: 12,
    ...overrides,
  };
}

/** Прямоугольник подписи по смещению — то же, что считает layoutEdgeLabels. */
function boxOf(e: LabelEdge, offset: number) {
  const dx = e.target.x - e.source.x;
  const dy = e.target.y - e.source.y;
  const d = Math.hypot(dx, dy);
  const cx = e.source.x + (dx / d) * (e.source.radius + offset);
  const cy = e.source.y + (dy / d) * (e.source.radius + offset);
  return { x1: cx - e.labelWidth / 2, y1: cy - e.labelHeight / 2, x2: cx + e.labelWidth / 2, y2: cy + e.labelHeight / 2 };
}

function overlap(a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

describe("estimateLabelSize", () => {
  it("пустая подпись не занимает места", () => {
    expect(estimateLabelSize("  ", 8)).toEqual({ width: 0, height: 0 });
  });

  it("ширина растёт с длиной текста", () => {
    expect(estimateLabelSize("союзники", 8).width).toBeGreaterThan(estimateLabelSize("друг", 8).width);
  });
});

describe("layoutEdgeLabels", () => {
  it("одиночная подпись стоит в середине связи (между краями узлов)", () => {
    const offsets = layoutEdgeLabels([edge("e1", [0, 0], [220, 0])]);
    expect(offsets.get("e1")).toBe(100); // (220 - 10 - 10) / 2
  });

  it("подписи далёких связей не сдвигаются", () => {
    const offsets = layoutEdgeLabels([edge("e1", [0, 0], [220, 0]), edge("e2", [0, 300], [220, 300])]);
    expect(offsets.get("e1")).toBe(100);
    expect(offsets.get("e2")).toBe(100);
  });

  it("пересекающиеся в середине связи: вторая подпись уезжает вдоль своей связи", () => {
    const a = edge("a", [0, 0], [220, 0]);
    const b = edge("b", [110, -110], [110, 110]);
    const offsets = layoutEdgeLabels([a, b]);

    expect(offsets.get("a")).toBe(100);
    expect(offsets.get("b")).not.toBe(100);
    expect(overlap(boxOf(a, offsets.get("a")!), boxOf(b, offsets.get("b")!))).toBe(false);
  });

  it("несколько связей между одной парой узлов: подписи расходятся", () => {
    const edges = [edge("a", [0, 0], [320, 0]), edge("b", [0, 0], [320, 0]), edge("c", [0, 0], [320, 0])];
    const offsets = layoutEdgeLabels(edges);
    const boxes = edges.map((e) => boxOf(e, offsets.get(e.id)!));

    expect(overlap(boxes[0], boxes[1])).toBe(false);
    expect(overlap(boxes[0], boxes[2])).toBe(false);
    expect(overlap(boxes[1], boxes[2])).toBe(false);
  });

  it("связь без подписи не мешает и остаётся в середине", () => {
    const a = edge("a", [0, 0], [220, 0], { labelWidth: 0, labelHeight: 0 });
    const b = edge("b", [110, -110], [110, 110]);
    const offsets = layoutEdgeLabels([a, b]);

    expect(offsets.get("a")).toBe(100);
    expect(offsets.get("b")).toBe(100);
  });

  it("если на связи нет свободного места, подпись остаётся в середине", () => {
    const a = edge("a", [0, 0], [60, 0]);
    const b = edge("b", [0, 0], [60, 0]);
    const offsets = layoutEdgeLabels([a, b]);

    expect(offsets.get("b")).toBe(20);
  });

  it("совпадающие узлы не ломают расчёт", () => {
    const offsets = layoutEdgeLabels([edge("a", [5, 5], [5, 5])]);
    expect(offsets.get("a")).toBe(0);
  });
});
