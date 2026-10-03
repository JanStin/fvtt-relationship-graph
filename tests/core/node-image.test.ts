import { describe, expect, it } from "vitest";
import { cytoscapeImageFit, normalizeImageFit, normalizeImageSource, pickActorImage } from "../../src/core/node-image";

describe("pickActorImage", () => {
  it("по умолчанию и для «Портрет» — портрет", () => {
    expect(pickActorImage(undefined, "p.webp", "t.webp")).toBe("p.webp");
    expect(pickActorImage("portrait", "p.webp", "t.webp")).toBe("p.webp");
  });

  it("«Токен» — картинка токена", () => {
    expect(pickActorImage("token", "p.webp", "t.webp")).toBe("t.webp");
  });

  it("шаблонный токен или токен без картинки — портрет", () => {
    expect(pickActorImage("token", "p.webp", "tokens/goblin-*.webp")).toBe("p.webp");
    expect(pickActorImage("token", "p.webp", "")).toBe("p.webp");
    expect(pickActorImage("token", "p.webp", undefined)).toBe("p.webp");
  });
});

describe("cytoscapeImageFit", () => {
  it("cover, contain, fill; нет поля — cover", () => {
    expect(cytoscapeImageFit(undefined, 60, null)).toEqual({ fit: "cover", stretch: false });
    expect(cytoscapeImageFit("cover", 60, null)).toEqual({ fit: "cover", stretch: false });
    expect(cytoscapeImageFit("contain", 60, null)).toEqual({ fit: "contain", stretch: false });
    expect(cytoscapeImageFit("fill", 60, null)).toEqual({ fit: "none", stretch: true });
  });

  it("scale-down: мелкая картинка — натуральный размер, крупная или неизвестная — contain", () => {
    expect(cytoscapeImageFit("scale-down", 60, { width: 40, height: 50 })).toEqual({ fit: "none", stretch: false });
    expect(cytoscapeImageFit("scale-down", 60, { width: 400, height: 50 })).toEqual({ fit: "contain", stretch: false });
    expect(cytoscapeImageFit("scale-down", 60, null)).toEqual({ fit: "contain", stretch: false });
    // у узла крупнее та же картинка уже помещается как есть
    expect(cytoscapeImageFit("scale-down", 120, { width: 100, height: 100 })).toEqual({ fit: "none", stretch: false });
  });
});

describe("нормализация", () => {
  it("неизвестные значения — по умолчанию", () => {
    expect(normalizeImageSource("avatar")).toBe("portrait");
    expect(normalizeImageSource("token")).toBe("token");
    expect(normalizeImageFit("stretch")).toBe("cover");
    expect(normalizeImageFit("scale-down")).toBe("scale-down");
  });
});
