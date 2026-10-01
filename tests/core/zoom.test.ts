import { describe, expect, it } from "vitest";
import {
  formatZoom,
  sliderToZoom,
  stepZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_SLIDER_STEPS,
  zoomToSlider,
} from "../../src/core/zoom";

describe("zoomToSlider / sliderToZoom", () => {
  it("края ползунка — пределы масштаба", () => {
    expect(zoomToSlider(ZOOM_MIN)).toBe(0);
    expect(zoomToSlider(ZOOM_MAX)).toBe(ZOOM_SLIDER_STEPS);
    expect(sliderToZoom(0)).toBeCloseTo(ZOOM_MIN);
    expect(sliderToZoom(ZOOM_SLIDER_STEPS)).toBeCloseTo(ZOOM_MAX);
  });

  it("взаимно обратны (с точностью до деления ползунка)", () => {
    for (const zoom of [0.1, 0.5, 1, 2, 4]) {
      expect(sliderToZoom(zoomToSlider(zoom))).toBeCloseTo(zoom, 1);
    }
  });

  it("логарифмическая шкала: удвоение масштаба — всегда равный шаг ползунка", () => {
    const a = zoomToSlider(0.25) - zoomToSlider(0.125);
    const b = zoomToSlider(2) - zoomToSlider(1);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it("значения за пределами обрезаются", () => {
    expect(zoomToSlider(100)).toBe(ZOOM_SLIDER_STEPS);
    expect(zoomToSlider(0.001)).toBe(0);
    expect(sliderToZoom(-50)).toBeCloseTo(ZOOM_MIN);
    expect(sliderToZoom(ZOOM_SLIDER_STEPS * 2)).toBeCloseTo(ZOOM_MAX);
  });
});

describe("stepZoom", () => {
  it("«+» и «−» меняют масштаб в одно и то же число раз", () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.25);
    expect(stepZoom(1, -1)).toBeCloseTo(0.8);
  });

  it("не выходит за пределы", () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("formatZoom", () => {
  it("проценты, округлённые до целого", () => {
    expect(formatZoom(1)).toBe("100 %");
    expect(formatZoom(0.333)).toBe("33 %");
  });
});
