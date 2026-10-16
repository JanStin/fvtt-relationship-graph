import { describe, expect, it } from "vitest";
import { idsInCatalogOrder, indexForSlot, moveToIndex, sortByOrder } from "../../src/core/catalog-order";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("moveToIndex", () => {
  it("ставит элемент на новое место, не трогая вход", () => {
    expect(moveToIndex(items, "b", 0)?.map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moveToIndex(items, "a", 2)?.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("двигать некуда — null", () => {
    expect(moveToIndex(items, "a", -1)).toBeNull();
    expect(moveToIndex(items, "c", 3)).toBeNull();
    expect(moveToIndex(items, "b", 1)).toBeNull();
    expect(moveToIndex(items, "nope", 0)).toBeNull();
  });
});

describe("indexForSlot", () => {
  it("щель ниже элемента сдвигается на одну после его изъятия", () => {
    expect(indexForSlot(0, 3)).toBe(2); // первый — в самый конец
    expect(indexForSlot(2, 0)).toBe(0); // последний — в начало
    expect(indexForSlot(1, 1)).toBe(1); // щель перед собой
    expect(indexForSlot(1, 2)).toBe(1); // щель после себя
  });
});

describe("sortByOrder", () => {
  it("без порядка — исходный порядок", () => {
    expect(sortByOrder(items, undefined).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(sortByOrder(items, null).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("сначала по порядку, остальные — в конце; лишние id пропускаются", () => {
    expect(sortByOrder(items, ["c", "gone", "a"]).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });
});

describe("idsInCatalogOrder", () => {
  it("id по справочнику, неизвестные — последними", () => {
    expect(idsInCatalogOrder(["x", "c", "a"], items)).toEqual(["a", "c", "x"]);
  });
});
