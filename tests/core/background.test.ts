import { describe, expect, it } from "vitest";
import {
  backgroundColor,
  backgroundFromEdit,
  backgroundImageRect,
  coverVisibleArea,
  DEFAULT_BACKGROUND_COLOR,
  defaultBackground,
  setBackground,
  tileScreenLayout,
  type BackgroundEditValues,
} from "../../src/core/background";
import type { GraphData } from "../../src/core/model";

const empty: GraphData = { nodes: [], edges: [], factions: [], relationshipTypes: [], conditions: [] };

function values(overrides: Partial<BackgroundEditValues> = {}): BackgroundEditValues {
  return {
    color: "",
    image: "",
    imageMode: "single",
    imageX: "0",
    imageY: "0",
    imageWidth: "0",
    imageOpacityPercent: "100",
    ...overrides,
  };
}

describe("backgroundFromEdit", () => {
  it("переводит текст полей в числа", () => {
    expect(
      backgroundFromEdit(
        values({ color: " #123456 ", image: " a.png ", imageMode: "tile", imageX: "-10,5", imageY: "20", imageWidth: "300", imageOpacityPercent: "40" }),
      ),
    ).toEqual({
      color: "#123456",
      image: "a.png",
      imageMode: "tile",
      imageX: -10.5,
      imageY: 20,
      imageWidth: 300,
      imageOpacity: 0.4,
    });
  });

  it("мусор и крайние значения приводятся к допустимым", () => {
    const background = backgroundFromEdit(
      values({ imageMode: "weird" as never, imageX: "abc", imageY: "", imageWidth: "3", imageOpacityPercent: "0" }),
    );
    expect(background.imageMode).toBe("single");
    expect(background.imageX).toBe(0);
    expect(background.imageY).toBe(0);
    expect(background.imageWidth).toBe(16);
    expect(background.imageOpacity).toBe(0.05);
  });

  it("неположительная ширина — натуральный размер (0)", () => {
    expect(backgroundFromEdit(values({ imageWidth: "-50" })).imageWidth).toBe(0);
  });
});

describe("setBackground", () => {
  it("задаёт фон", () => {
    const background = { ...defaultBackground(), color: "#000000" };
    expect(setBackground(empty, background).background).toEqual(background);
  });

  it("сброс и пустой фон хранятся как null — иначе setFlag оставил бы старый", () => {
    expect(setBackground(empty, null).background).toBeNull();
    expect(setBackground(empty, defaultBackground()).background).toBeNull();
  });
});

describe("backgroundColor", () => {
  it("пустой цвет и отсутствие фона — стандартный цвет", () => {
    expect(backgroundColor(undefined)).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(backgroundColor(null)).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(backgroundColor(defaultBackground())).toBe(DEFAULT_BACKGROUND_COLOR);
    expect(backgroundColor({ ...defaultBackground(), color: "#abcdef" })).toBe("#abcdef");
  });
});

describe("backgroundImageRect", () => {
  it("ширина 0 — натуральный размер", () => {
    const rect = backgroundImageRect({ ...defaultBackground(), imageX: 5, imageY: 6 }, { width: 400, height: 200 });
    expect(rect).toEqual({ x: 5, y: 6, width: 400, height: 200 });
  });

  it("заданная ширина сохраняет пропорции", () => {
    const rect = backgroundImageRect({ ...defaultBackground(), imageWidth: 100 }, { width: 400, height: 200 });
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
  });
});

describe("tileScreenLayout", () => {
  it("плитки масштабируются и сдвигаются вместе с видом", () => {
    const tile = tileScreenLayout({ x: 10, y: -20, width: 100, height: 50 }, { pan: { x: 300, y: 200 }, zoom: 2 });
    expect(tile).toEqual({ x: 320, y: 160, width: 200, height: 100 });
  });
});

describe("coverVisibleArea", () => {
  it("широкая картинка закрывает высокую область по высоте и стоит по центру", () => {
    const placement = coverVisibleArea({ x: 0, y: 0, width: 100, height: 200 }, { width: 400, height: 200 });
    expect(placement.imageWidth).toBe(400);
    expect(placement.imageX).toBe(-150);
    expect(placement.imageY).toBe(0);
  });

  it("высокая картинка закрывает широкую область по ширине", () => {
    const placement = coverVisibleArea({ x: 10, y: 10, width: 300, height: 100 }, { width: 100, height: 200 });
    expect(placement.imageWidth).toBe(300);
    expect(placement.imageX).toBe(10);
    expect(placement.imageY).toBe(10 + (100 - 600) / 2);
  });
});
