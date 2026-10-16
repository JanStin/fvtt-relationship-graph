import { describe, expect, it } from "vitest";
import { imageAlignPosition, normalizeImageAlign } from "../../src/core/image-align";

describe("image-align", () => {
  it("положение картинки по выравниванию; нет поля — по центру", () => {
    expect(imageAlignPosition("top-left")).toEqual({ x: "0%", y: "0%" });
    expect(imageAlignPosition("top-right")).toEqual({ x: "100%", y: "0%" });
    expect(imageAlignPosition("center")).toEqual({ x: "50%", y: "50%" });
    expect(imageAlignPosition("bottom-left")).toEqual({ x: "0%", y: "100%" });
    expect(imageAlignPosition("bottom-right")).toEqual({ x: "100%", y: "100%" });
    expect(imageAlignPosition("top")).toEqual({ x: "50%", y: "0%" });
    expect(imageAlignPosition("bottom")).toEqual({ x: "50%", y: "100%" });
    expect(imageAlignPosition("left")).toEqual({ x: "0%", y: "50%" });
    expect(imageAlignPosition("right")).toEqual({ x: "100%", y: "50%" });
    expect(imageAlignPosition(undefined)).toEqual({ x: "50%", y: "50%" });
  });

  it("неизвестное значение — по центру", () => {
    expect(normalizeImageAlign("middle")).toBe("center");
    expect(normalizeImageAlign("top")).toBe("top");
    expect(normalizeImageAlign(1)).toBe("center");
    expect(normalizeImageAlign("bottom-left")).toBe("bottom-left");
  });
});
