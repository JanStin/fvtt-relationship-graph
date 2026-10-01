import { describe, expect, it } from "vitest";
import { clientToModel } from "../../src/core/hit-test";

describe("clientToModel", () => {
  it("без pan/zoom вычитает только смещение контейнера", () => {
    const p = clientToModel(150, 260, { left: 100, top: 200, pan: { x: 0, y: 0 }, zoom: 1 });
    expect(p).toEqual({ x: 50, y: 60 });
  });

  it("учитывает pan и zoom", () => {
    const p = clientToModel(300, 400, { left: 100, top: 200, pan: { x: 40, y: -20 }, zoom: 2 });
    expect(p).toEqual({ x: 80, y: 110 });
  });
});
