import { describe, expect, it } from "vitest";
import type { GraphData } from "../../src/core/model";
import {
  createRelationshipType,
  ensureDefaultRelationshipTypes,
  parseDash,
  removeRelationshipType,
  updateRelationshipType,
} from "../../src/core/relationship-types";

function makeData(): GraphData {
  return {
    nodes: [],
    edges: [
      { id: "e1", source: "a", target: "b", label: "", directional: false, relationshipTypeId: "ally", gmOnly: false },
      { id: "e2", source: "b", target: "c", label: "", directional: false, relationshipTypeId: "enemy", gmOnly: false },
    ],
    factions: [],
    relationshipTypes: [
      { id: "ally", label: "Союзник", color: "#00ff00", dash: "" },
      { id: "enemy", label: "Враг", color: "#ff0000", dash: "8,5" },
    ],
    conditions: [],
  };
}

describe("parseDash", () => {
  it("разбирает длины через запятую и/или пробелы", () => {
    expect(parseDash("8,5")).toEqual([8, 5]);
    expect(parseDash(" 2, 4 ,6 ")).toEqual([2, 4, 6]);
  });

  it("пустая строка и мусор — сплошная линия", () => {
    expect(parseDash("")).toBeNull();
    expect(parseDash("8")).toBeNull();
    expect(parseDash("a,b")).toBeNull();
    expect(parseDash("8,0")).toBeNull();
    expect(parseDash("8,-2")).toBeNull();
  });
});

describe("ensureDefaultRelationshipTypes", () => {
  it("добавляет розовый тип «Романтическая», если его нет", () => {
    const result = ensureDefaultRelationshipTypes(makeData());
    expect(result.relationshipTypes.map((rt) => rt.id)).toEqual(["ally", "enemy", "romantic"]);
    expect(result.relationshipTypes[2]).toEqual({ id: "romantic", label: "Романтическая", color: "#ec4899", dash: "" });
  });

  it("существующий тип с тем же id не трогает (в том числе переименованный)", () => {
    const data = makeData();
    data.relationshipTypes.push({ id: "romantic", label: "Любовь", color: "#ff00ff", dash: "2,4" });
    expect(ensureDefaultRelationshipTypes(data)).toBe(data);
  });
});

describe("createRelationshipType", () => {
  it("добавляет тип, обрезая пробелы и нормализуя стиль линии", () => {
    const result = createRelationshipType(makeData(), "t3", { label: " Родня ", color: " #123456 ", dash: "4 4" });
    expect(result.relationshipTypes[2]).toEqual({ id: "t3", label: "Родня", color: "#123456", dash: "4,4" });
  });

  it("пустые поля заменяются значениями по умолчанию, мусорный стиль — сплошной линией", () => {
    const result = createRelationshipType(makeData(), "t3", { label: "", color: "", dash: "oops" });
    expect(result.relationshipTypes[2]).toEqual({ id: "t3", label: "Новый тип связи", color: "#888888", dash: "" });
  });

  it("бросает на занятом и на пустом id (пустой id значит «тип не задан»)", () => {
    expect(() => createRelationshipType(makeData(), "ally", { label: "x", color: "", dash: "" })).toThrow();
    expect(() => createRelationshipType(makeData(), "", { label: "x", color: "", dash: "" })).toThrow();
  });
});

describe("updateRelationshipType", () => {
  it("меняет поля, не мутируя вход", () => {
    const data = makeData();
    const result = updateRelationshipType(data, "ally", { label: "Друг", color: "#0000ff", dash: "2,4" });

    expect(result.relationshipTypes[0]).toEqual({ id: "ally", label: "Друг", color: "#0000ff", dash: "2,4" });
    expect(data.relationshipTypes[0].label).toBe("Союзник");
  });

  it("пустое название и цвет оставляют прежние", () => {
    const result = updateRelationshipType(makeData(), "enemy", { label: " ", color: "", dash: "" });
    expect(result.relationshipTypes[1]).toEqual({ id: "enemy", label: "Враг", color: "#ff0000", dash: "" });
  });

  it("бросает на неизвестном типе", () => {
    expect(() => updateRelationshipType(makeData(), "nope", { label: "x", color: "", dash: "" })).toThrow(/not found/);
  });
});

describe("removeRelationshipType", () => {
  it("удаляет тип, связи остаются без типа", () => {
    const data = makeData();
    const result = removeRelationshipType(data, "ally");

    expect(result.relationshipTypes.map((rt) => rt.id)).toEqual(["enemy"]);
    expect(result.edges.map((e) => e.relationshipTypeId)).toEqual(["", "enemy"]);
    expect(result.edges[1]).toBe(data.edges[1]);
    expect(data.edges[0].relationshipTypeId).toBe("ally");
  });

  it("неизвестный тип — no-op", () => {
    const data = makeData();
    expect(removeRelationshipType(data, "nope")).toEqual(data);
  });
});
