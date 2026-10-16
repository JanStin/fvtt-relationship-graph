import { beforeEach, describe, expect, it } from "vitest";
import type { Description } from "../../src/core/describe";
import { createInfoPanel, isLongText, LONG_TEXT_LINES, textParagraphs } from "../../src/ui/panels/InfoPanel";
import {
  clampInfoPanelWidth,
  INFO_PANEL_DEFAULT_WIDTH,
  INFO_PANEL_MIN_WIDTH,
  loadCollapsedBlocks,
  loadInfoPanelWidth,
  saveInfoPanelWidth,
  setBlockCollapsed,
} from "../../src/ui/panels/info-prefs";

const silent = { onClose() {}, onOpen() {}, onHover() {}, onExpand() {} };

function description(text: string): Description {
  return {
    title: "Анна",
    header: { kind: "faction", color: "#000000" },
    blocks: [
      { kind: "text", id: "description", label: "Описание", text },
      { kind: "chips", id: "conditions", label: "Состояния", chips: [{ label: "Мёртв" }] },
    ],
  };
}

beforeEach(() => localStorage.clear());

describe("текст сведений", () => {
  it("абзацы — по пустым строкам, одиночный перенос остаётся внутри абзаца", () => {
    expect(textParagraphs("Первый\nвсё ещё первый\n\n  \nВторой\n")).toEqual(["Первый\nвсё ещё первый", "Второй"]);
    const panel = createInfoPanel(description("А\n\nБ"), silent);
    expect([...panel.querySelectorAll(".frg-info-text p")].map((p) => p.textContent)).toEqual(["А", "Б"]);
  });

  it("длинный текст — кнопка «Развернуть» открывает его целиком", () => {
    expect(isLongText("коротко")).toBe(false);
    const long = Array.from({ length: LONG_TEXT_LINES + 1 }, (_, i) => `строка ${i}`).join("\n");
    expect(isLongText(long)).toBe(true);
    // одна строка без переносов — тоже длинная, если в панели займёт больше строк
    expect(isLongText("x".repeat(50 * (LONG_TEXT_LINES + 1)))).toBe(true);

    expect(createInfoPanel(description("коротко"), silent).querySelector(".frg-info-expand")).toBeNull();
    const expanded: [string, string][] = [];
    const panel = createInfoPanel(description(long), { ...silent, onExpand: (title, text) => expanded.push([title, text]) });
    panel.querySelector<HTMLButtonElement>(".frg-info-expand")!.click();
    expect(expanded).toEqual([["Анна — Описание", long]]);
  });
});

describe("сворачиваемые блоки", () => {
  it("заголовок сворачивает блок, состояние запоминается для следующих сведений", () => {
    const panel = createInfoPanel(description("текст"), silent);
    const [toggle] = panel.querySelectorAll<HTMLButtonElement>(".frg-info-section-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.querySelector<HTMLElement>("[data-block=description] .frg-info-section-content")!.hidden).toBe(true);
    expect([...loadCollapsedBlocks()]).toEqual(["description"]);

    const next = createInfoPanel(description("другой"), silent);
    expect(next.querySelector<HTMLElement>("[data-block=description] .frg-info-section-content")!.hidden).toBe(true);
    expect(next.querySelector<HTMLElement>("[data-block=conditions] .frg-info-section-content")!.hidden).toBe(false);

    setBlockCollapsed("description", false);
    expect(loadCollapsedBlocks().size).toBe(0);
  });

  it("испорченное значение в хранилище — все блоки развёрнуты", () => {
    localStorage.setItem("fvtt-relationship-graph.infoPanelCollapsed", "{oops");
    expect(loadCollapsedBlocks().size).toBe(0);
  });
});

describe("ширина панели", () => {
  it("пределы: не уже минимума, не шире доли окна; в узком окне важнее верхний", () => {
    expect(clampInfoPanelWidth(100, 2000)).toBe(INFO_PANEL_MIN_WIDTH);
    expect(clampInfoPanelWidth(1500, 1000)).toBe(600);
    expect(clampInfoPanelWidth(400, 1000)).toBe(400);
    expect(clampInfoPanelWidth(300, 400)).toBe(240);
  });

  it("запоминается; нет значения или мусор — по умолчанию", () => {
    expect(loadInfoPanelWidth()).toBe(INFO_PANEL_DEFAULT_WIDTH);
    saveInfoPanelWidth(452.4);
    expect(loadInfoPanelWidth()).toBe(452);
    expect(createInfoPanel(description("т"), silent).style.width).toBe("452px");
    localStorage.setItem("fvtt-relationship-graph.infoPanelWidth", "abc");
    expect(loadInfoPanelWidth()).toBe(INFO_PANEL_DEFAULT_WIDTH);
  });

  it("край панели — разделитель, стрелки меняют и запоминают ширину", () => {
    const panel = createInfoPanel(description("т"), silent);
    const handle = panel.querySelector<HTMLElement>(".frg-info-resize")!;
    expect(handle.getAttribute("role")).toBe("separator");
    // jsdom не считает размеры: ширина панели — 0, окна — без ограничения
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(panel.style.width).toBe(`${INFO_PANEL_MIN_WIDTH}px`);
    expect(loadInfoPanelWidth()).toBe(INFO_PANEL_MIN_WIDTH);
  });
});
