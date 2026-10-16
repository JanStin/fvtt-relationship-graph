import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/core/color";
import { isLightUi, mixHex, parseUiTheme, UI_THEME_VARS, uiThemeVars } from "../../src/core/ui-theme";

describe("цвета интерфейса", () => {
  it("стандартный набор без своего цвета — без переменных (цвета темы Foundry)", () => {
    expect(uiThemeVars("", "")).toEqual({});
    expect(isLightUi("", "")).toBeNull();
  });

  it("набор задаёт все цвета; панели — цвета панели инструментов", () => {
    const vars = uiThemeVars("parchment", "");
    expect(Object.keys(vars).sort()).toEqual([...UI_THEME_VARS].sort());
    expect(vars["--frg-toolbar-bg"]).toBe(vars["--frg-surface"]);
    expect(isLightUi("parchment", "")).toBe(true);
    expect(isLightUi("night", "")).toBe(false);
  });

  it("свой цвет поверх набора: фон и текст от цвета, акцент — от набора", () => {
    const vars = uiThemeVars("night", "#f5f5dc");
    expect(vars["--frg-surface"]).toBe("#f5f5dc");
    expect(vars["--frg-toolbar-bg"]).toBe("#f5f5dc");
    // светлый фон — тёмный текст
    expect(vars["--frg-text"]).toBe("#1e293b");
    // акцент набора на светлом фоне не виден (сиреневый на бежевом) — стандартный для светлого
    expect(contrastRatio(vars["--frg-accent"], "#f5f5dc")).toBeGreaterThanOrEqual(3);
    // тёмный свой цвет — акцент набора виден, остаётся
    expect(uiThemeVars("night", "#101020")["--frg-accent"]).toBe(uiThemeVars("night", "")["--frg-accent"]);
    expect(isLightUi("night", "#f5f5dc")).toBe(true);
  });

  it("свой цвет со стандартным набором — фон, текст и видимые на нём акценты", () => {
    const vars = uiThemeVars("", "#203040");
    expect(vars["--frg-surface"]).toBe("#203040");
    expect(vars["--frg-text"]).toBe("#e2e8f0");
    expect(vars["--frg-accent"]).toBe("#facc15");
  });

  it("неверный цвет и неизвестный набор — как стандартные", () => {
    expect(uiThemeVars("", "red")).toEqual({});
    expect(parseUiTheme("neon")).toBe("");
    expect(parseUiTheme(undefined)).toBe("");
    expect(parseUiTheme("forest")).toBe("forest");
  });

  it("смешение цветов", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.3)).toBe("#102030");
  });
});

describe("свой цвет: контраст WCAG на любом цвете", () => {
  // сетка цветов, включая средние по яркости, где фиксированные доли смеси не работали
  const samples: string[] = [];
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) {
    samples.push(`#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`);
  }
  samples.push("#cc4466", "#5577aa", "#808080", "#dd0099");

  it("текст и приглушённый текст ≥ 4.5 (и на подсветке), рамка ≥ 3", () => {
    for (const color of samples) {
      const v = uiThemeVars("", color);
      const surface = v["--frg-surface"];
      const hover = v["--frg-hover"];
      expect(contrastRatio(v["--frg-text"], surface), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--frg-text-strong"], surface), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--frg-text-muted"], surface), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--frg-text-muted"], hover), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--frg-border"], surface), color).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(hover, surface), color).toBeGreaterThan(1);
      expect(contrastRatio(v["--frg-accent"], surface), color).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v["--frg-accent-text"], v["--frg-accent"]), color).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(v["--frg-focus"], surface), color).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(v["--frg-danger"], surface), color).toBeGreaterThanOrEqual(4.5);
    }
  });
});
