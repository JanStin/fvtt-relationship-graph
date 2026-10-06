import { describe, expect, it } from "vitest";
import type { GraphData, GraphEdge, GraphNode } from "../../src/core/model";
import { isEmptyQuery, normalizeSearchText, searchGraph } from "../../src/core/search";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "placeholder",
    actorId: null,
    name: overrides.id,
    originalName: "",
    img: "",
    x: 0,
    y: 0,
    scale: 1.0,
    primaryFactionId: null,
    factionIds: [],
    role: "",
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    hidden: false,
    gmOnly: false,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<GraphEdge> & { id: string }): GraphEdge {
  return {
    source: "a",
    target: "b",
    label: "",
    directional: false,
    relationshipTypeId: "",
    gmOnly: false,
    ...overrides,
  };
}

function makeData(nodes: GraphNode[], edges: GraphEdge[] = []): GraphData {
  return { nodes, edges, factions: [], relationshipTypes: [], conditions: [] };
}


describe("normalizeSearchText", () => {
  it("нижний регистр и ё → е", () => {
    expect(normalizeSearchText("Пётр ЁЛКИН")).toBe("петр елкин");
  });
});

describe("isEmptyQuery", () => {
  it("пробелы — пустой запрос", () => {
    expect(isEmptyQuery("   ")).toBe(true);
    expect(isEmptyQuery(" а ")).toBe(false);
  });
});

describe("searchGraph", () => {
  const data = makeData(
    [
      makeNode({ id: "a", name: "Пётр Великий", role: "Король" }),
      makeNode({ id: "b", name: "Анна", role: "Шпионка короля" }),
      makeNode({ id: "c", name: "Борис", role: "Кузнец" }),
    ],
    [
      makeEdge({ id: "e1", source: "a", target: "b", label: "Доверяет" }),
      makeEdge({ id: "e2", source: "b", target: "c", label: "Должник" }),
    ],
  );

  it("пустой запрос — нет результатов", () => {
    expect(searchGraph(data, "  ", true)).toEqual({ nodeIds: [], edgeIds: [] });
  });

  it("ищет узлы по имени и роли, без учёта регистра", () => {
    expect(searchGraph(data, "КОРОЛ", true).nodeIds).toEqual(["a", "b"]);
  });

  it("ё и е равны в обе стороны", () => {
    expect(searchGraph(data, "петр", true).nodeIds).toEqual(["a"]);
    expect(searchGraph(makeData([makeNode({ id: "x", name: "Федор" })]), "Фёдор", true).nodeIds).toEqual(["x"]);
  });

  it("обрезает пробелы по краям запроса", () => {
    expect(searchGraph(data, "  анна ", true).nodeIds).toEqual(["b"]);
  });

  it("ищет связи по подписи, имена концов не учитываются", () => {
    expect(searchGraph(data, "долж", true)).toEqual({ nodeIds: [], edgeIds: ["e2"] });
    expect(searchGraph(data, "Анна", true).edgeIds).toEqual([]);
  });

  it("один запрос находит и узлы, и связи", () => {
    const mixed = makeData([makeNode({ id: "a", name: "Друг семьи" })], [makeEdge({ id: "e", label: "Друг" })]);
    expect(searchGraph(mixed, "друг", true)).toEqual({ nodeIds: ["a"], edgeIds: ["e"] });
  });

  it("узел без имени ищется по имени по умолчанию", () => {
    const unnamed = makeData([makeNode({ id: "a", name: "" })]);
    expect(searchGraph(unnamed, "новый", true).nodeIds).toEqual(["a"]);
  });

  describe("видимость для игрока", () => {
    const hidden = makeData(
      [makeNode({ id: "h", name: "Тайный агент", role: "Убийца", hidden: true, gmOnly: true })],
      [makeEdge({ id: "g", label: "Тайный союз", gmOnly: true })],
    );

    it("GM находит скрытый узел и связь gmOnly", () => {
      expect(searchGraph(hidden, "тайн", true)).toEqual({ nodeIds: ["h"], edgeIds: ["g"] });
      expect(searchGraph(hidden, "убийц", true).nodeIds).toEqual(["h"]);
    });

    it("игрок не находит скрытый узел по имени и роли", () => {
      expect(searchGraph(hidden, "тайн", false).nodeIds).toEqual([]);
      expect(searchGraph(hidden, "убийц", false).nodeIds).toEqual([]);
    });

    it("игрок находит скрытый узел как «неизвестного»", () => {
      expect(searchGraph(hidden, "неизвест", false).nodeIds).toEqual(["h"]);
    });

    it("игрок не находит связь gmOnly", () => {
      expect(searchGraph(hidden, "союз", false).edgeIds).toEqual([]);
    });
  });
});
