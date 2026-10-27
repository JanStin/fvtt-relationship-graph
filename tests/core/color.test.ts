import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  distinctColors,
  isLightColor,
  mixOklab,
  oklabToRgb,
  parseHexColor,
  rgbToHex,
  rgbToOklab,
  watermarkColors,
  type Rgb,
} from "../../src/core/color";

describe("parseHexColor", () => {
  it("читает #rrggbb и #rgb", () => {
    expect(parseHexColor("#ff8000")).toEqual([255, 128, 0]);
    expect(parseHexColor(" #F80 ")).toEqual([255, 136, 0]);
  });

  it("другой формат — серый", () => {
    expect(parseHexColor("red")).toEqual([136, 136, 136]);
    expect(parseHexColor("")).toEqual([136, 136, 136]);
  });
});

describe("Oklab", () => {
  it("перевод туда и обратно возвращает тот же цвет", () => {
    const colors: Rgb[] = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [18, 200, 77],
      [64, 32, 240],
    ];
    colors.forEach((rgb) => expect(oklabToRgb(rgbToOklab(rgb))).toEqual(rgb));
  });

  it("белый — светлота 1 без оттенка", () => {
    const [lightness, a, b] = rgbToOklab([255, 255, 255]);
    expect(lightness).toBeCloseTo(1, 4);
    expect(a).toBeCloseTo(0, 4);
    expect(b).toBeCloseTo(0, 4);
  });
});

describe("mixOklab", () => {
  const red = rgbToOklab([255, 0, 0]);
  const blue = rgbToOklab([0, 0, 255]);
  const green = rgbToOklab([0, 255, 0]);

  it("один цвет с весом — он сам", () => {
    expect(mixOklab([red, blue], [0.3, 0])).toEqual([255, 0, 0]);
  });

  it("нет весов больше нуля — null", () => {
    expect(mixOklab([red, blue], [0, 0])).toBeNull();
    expect(mixOklab([], [])).toBeNull();
  });

  it("веса умножаются на одно число — цвет не меняется", () => {
    expect(mixOklab([red, blue], [0.1, 0.3])).toEqual(mixOklab([red, blue], [0.2, 0.6]));
  });

  it("смесь лежит между цветами: больший вес тянет к своему цвету", () => {
    const towardRed = mixOklab([red, blue], [0.8, 0.2]);
    const towardBlue = mixOklab([red, blue], [0.2, 0.8]);
    expect(towardRed?.[0]).toBeGreaterThan(towardBlue?.[0] ?? 0);
    expect(towardBlue?.[2]).toBeGreaterThan(towardRed?.[2] ?? 0);
  });

  it("середина красного и синего не темнее, чем в sRGB, — без грязного провала", () => {
    const [r, g, b] = mixOklab([red, blue], [1, 1]) ?? [0, 0, 0];
    // в sRGB середина — (128, 0, 128)
    expect(r + g + b).toBeGreaterThan(256);
  });

  it("смешивает больше двух цветов", () => {
    const mixed = mixOklab([red, green, blue], [1, 1, 1]);
    expect(mixed).not.toBeNull();
    expect(mixed?.every((channel) => channel > 0)).toBe(true);
  });
});

describe("isLightColor", () => {
  it("светлые и тёмные цвета", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#facc15")).toBe(true);
    expect(isLightColor("#fff")).toBe(true);
    expect(isLightColor("#0f172a")).toBe(false);
    expect(isLightColor("#000")).toBe(false);
    expect(isLightColor("#1e3a8a")).toBe(false);
  });

  it("не hex — null", () => {
    expect(isLightColor("")).toBeNull();
    expect(isLightColor("red")).toBeNull();
    expect(isLightColor("#12345")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("обратно к parseHexColor, каналы обрезаются до 0–255", () => {
    expect(rgbToHex(parseHexColor("#0a80ff"))).toBe("#0a80ff");
    expect(rgbToHex([300, -5, 127.6])).toBe("#ff0080");
  });
});

describe("distinctColors", () => {
  const dark = "#16213e";
  const first = () => 0;

  it("весь набор без повторов, все — #rrggbb", () => {
    const colors = distinctColors([], dark, { random: first });
    expect(colors).toHaveLength(16);
    expect(new Set(colors).size).toBe(16);
    colors.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  it("занятых нет — начало набора случайное", () => {
    expect(distinctColors([], dark, { random: () => 0.5 })[0]).not.toBe(distinctColors([], dark, { random: first })[0]);
  });

  it("первым идёт цвет, самый далёкий от занятого", () => {
    const [taken, ...rest] = distinctColors([], dark, { random: first });
    const next = distinctColors([taken], dark);
    expect(next[0]).not.toBe(taken);
    const distance = (a: string, b: string) => {
      const [x, y] = [rgbToOklab(parseHexColor(a)), rgbToOklab(parseHexColor(b))];
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    rest.forEach((color) => expect(distance(next[0], taken)).toBeGreaterThanOrEqual(distance(color, taken)));
  });

  it("неразобранные занятые цвета не мешают", () => {
    expect(distinctColors(["red", ""], dark, { random: first })).toEqual(distinctColors([], dark, { random: first }));
  });

  it("minContrast: на тёмном и на светлом фоне все цвета читаются", () => {
    for (const backdrop of [dark, "#ffffff", "#efe4c8"]) {
      distinctColors([], backdrop, { minContrast: 3 }).forEach((color) => expect(contrastRatio(color, backdrop)).toBeGreaterThanOrEqual(3));
    }
  });

  it("minContrast, которого не даёт ни один цвет, — весь набор", () => {
    expect(distinctColors([], dark, { minContrast: 21 })).toHaveLength(16);
  });
});

describe("watermarkColors", () => {
  it("тёмный фон — светлый текст с тёмной обводкой", () => {
    expect(watermarkColors("#16213e", "#6366f1", 0.2)).toMatchObject({ text: "#f8fafc", outline: "#0f172a" });
  });

  it("светлый фон — тёмный текст", () => {
    expect(watermarkColors("#ffffff", "#facc15", 0.2)).toMatchObject({ text: "#0f172a", outline: "#f8fafc" });
  });

  it("контраст надписи с фоном под ней — не меньше 3:1", () => {
    for (const [backdrop, fill] of [["#16213e", "#6366f1"], ["#ffffff", "#2563eb"], ["#808080", "#808080"], ["#efe4c8", "#b45309"]]) {
      const { text, alpha } = watermarkColors(backdrop, fill, 0.2);
      const under = parseHexColor(backdrop).map((c, i) => c * 0.8 + parseHexColor(fill)[i] * 0.2) as Rgb;
      const shown = under.map((c, i) => c * (1 - alpha) + parseHexColor(text)[i] * alpha) as Rgb;
      expect(contrastRatio(rgbToHex(shown), rgbToHex(under))).toBeGreaterThanOrEqual(2.9);
      expect(alpha).toBeGreaterThanOrEqual(0.45);
      expect(alpha).toBeLessThanOrEqual(0.85);
    }
  });
});
