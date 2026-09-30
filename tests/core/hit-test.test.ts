import { describe, expect, it } from "vitest";
import { clientToModel, findRegionAt, type Region } from "../../src/core/hit-test";

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

describe("findRegionAt", () => {
  const regions: Region[] = [
    { id: "big", x1: 0, y1: 0, x2: 100, y2: 100 },
    { id: "small", x1: 40, y1: 40, x2: 60, y2: 60 },
    { id: "far", x1: 200, y1: 200, x2: 300, y2: 300 },
  ];

  it("возвращает область, в которую попала точка", () => {
    expect(findRegionAt(regions, { x: 10, y: 10 })).toBe("big");
    expect(findRegionAt(regions, { x: 250, y: 250 })).toBe("far");
  });

  it("возвращает null вне областей", () => {
    expect(findRegionAt(regions, { x: 150, y: 150 })).toBeNull();
    expect(findRegionAt([], { x: 0, y: 0 })).toBeNull();
  });

  it("при перекрытии выбирает наименьшую область", () => {
    expect(findRegionAt(regions, { x: 50, y: 50 })).toBe("small");
  });

  it("граница области считается попаданием", () => {
    expect(findRegionAt(regions, { x: 100, y: 100 })).toBe("big");
  });
});
