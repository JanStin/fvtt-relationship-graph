import { beforeEach, describe, expect, it } from "vitest";
import {
  attachPanelWidth,
  clampPanelWidth,
  loadPanelWidth,
  PANEL_DEFAULT_WIDTH,
  PANEL_MIN_WIDTH,
  savePanelWidth,
} from "../../src/ui/panels/panel-width";

beforeEach(() => localStorage.clear());

describe("ширина боковых панелей", () => {
  it("пределы: не уже минимума, не шире доли окна; в узком окне важнее верхний", () => {
    expect(clampPanelWidth(100, 2000)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(1500, 1000)).toBe(600);
    expect(clampPanelWidth(400, 1000)).toBe(400);
    expect(clampPanelWidth(300, 400)).toBe(240);
  });

  it("запоминается; нет значения или мусор — по умолчанию", () => {
    expect(loadPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
    savePanelWidth(452.4);
    expect(loadPanelWidth()).toBe(452);
    localStorage.setItem("fvtt-relationship-graph.panelWidth", "abc");
    expect(loadPanelWidth()).toBe(PANEL_DEFAULT_WIDTH);
  });

  it("любая панель получает общую ширину, край и переменную для ползунка масштаба", () => {
    savePanelWidth(420);
    const wrapper = document.createElement("div");
    const form = document.createElement("form");
    form.className = "frg-panel";
    wrapper.append(form);
    attachPanelWidth(form);
    expect(form.style.width).toBe("420px");
    expect(wrapper.style.getPropertyValue("--frg-panel-width")).toBe("420px");
    const handle = form.querySelector<HTMLElement>(".frg-panel-resize")!;
    expect(handle.getAttribute("role")).toBe("separator");

    // jsdom не считает размеры (у окна ширина 0) — переменная и сохранённое значение идут за шириной
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(form.style.width).not.toBe("420px");
    expect(wrapper.style.getPropertyValue("--frg-panel-width")).toBe(form.style.width);
  });

  it("стрелка у панели без окна — минимум, и он запоминается для следующей", () => {
    const panel = document.createElement("div");
    attachPanelWidth(panel);
    panel.querySelector<HTMLElement>(".frg-panel-resize")!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(panel.style.width).toBe(`${PANEL_MIN_WIDTH}px`);
    expect(loadPanelWidth()).toBe(PANEL_MIN_WIDTH);
  });
});
