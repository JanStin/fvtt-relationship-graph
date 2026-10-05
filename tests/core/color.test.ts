import { describe, expect, it } from "vitest";
import { mixOklab, oklabToRgb, parseHexColor, rgbToOklab, type Rgb } from "../../src/core/color";

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
