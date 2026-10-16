import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type cytoscape from "cytoscape";
import { createHoverPreview, HOVER_DELAY_MS } from "../../src/ui/hover-preview";

type Handler = (evt: { target: unknown }) => void;

/** Минимальный cy: подписки по событиям, контейнер и узел с рамкой. */
function fakeCy() {
  const handlers = new Map<string, Handler[]>();
  const container = document.createElement("div");
  const on = (events: string, selectorOrHandler: string | Handler, maybeHandler?: Handler) => {
    const handler = typeof selectorOrHandler === "function" ? selectorOrHandler : maybeHandler!;
    for (const name of events.split(" ")) handlers.set(name, [...(handlers.get(name) ?? []), handler]);
  };
  const off = (events: string, selectorOrHandler: string | Handler, maybeHandler?: Handler) => {
    const handler = typeof selectorOrHandler === "function" ? selectorOrHandler : maybeHandler!;
    for (const name of events.split(" ")) handlers.set(name, (handlers.get(name) ?? []).filter((h) => h !== handler));
  };
  const emit = (name: string, target: unknown = null) => handlers.get(name)?.forEach((h) => h({ target }));
  const cy = { on, off, container: () => container } as unknown as cytoscape.Core;
  const node = { id: () => "a", renderedBoundingBox: () => ({ x1: 100, x2: 140, y1: 100, y2: 140 }) };
  return { cy, emit, node, handlers };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("предпросмотр по наведению", () => {
  it("через задержку — имя, роль и фракция; уход с узла прячет", () => {
    const host = document.createElement("div");
    const { cy, emit, node } = fakeCy();
    createHoverPreview(host, cy, () => ({ title: "Алиса", role: "Капитан", faction: { label: "Стража", color: "#ff0000" } }));

    emit("mouseover", node);
    vi.advanceTimersByTime(HOVER_DELAY_MS - 1);
    expect(host.querySelector(".frg-hover-preview")).toBeNull();
    vi.advanceTimersByTime(1);
    const tip = host.querySelector(".frg-hover-preview")!;
    expect(tip.getAttribute("role")).toBe("tooltip");
    expect(tip.textContent).toBe("АлисаКапитанСтража");

    emit("mouseout", node);
    expect(host.querySelector(".frg-hover-preview")).toBeNull();
  });

  it("нажатие или перемещение вида до задержки — подсказки нет; destroy снимает подписки", () => {
    const host = document.createElement("div");
    const { cy, emit, node, handlers } = fakeCy();
    const preview = createHoverPreview(host, cy, () => ({ title: "Карл", role: "", faction: null }));

    emit("mouseover", node);
    emit("pan");
    vi.advanceTimersByTime(HOVER_DELAY_MS);
    expect(host.querySelector(".frg-hover-preview")).toBeNull();

    preview.destroy();
    expect([...handlers.values()].every((list) => list.length === 0)).toBe(true);
  });
});
