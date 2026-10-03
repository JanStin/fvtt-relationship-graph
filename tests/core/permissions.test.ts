import { describe, expect, it } from "vitest";
import type { NodeEditValues } from "../../src/core/edit";
import type { Faction, GraphData, GraphEdge, GraphNode } from "../../src/core/model";
import {
  canEditNode,
  planDeletion,
  restrictFactionEdit,
  restrictNodeEdit,
  visibleEdgeCount,
} from "../../src/core/permissions";

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

function makeEdge(overrides: Partial<GraphEdge> & { id: string; source: string; target: string }): GraphEdge {
  return { label: "", directional: false, relationshipTypeId: "", gmOnly: false, ...overrides };
}

function values(overrides: Partial<NodeEditValues> = {}): NodeEditValues {
  return {
    type: "placeholder",
    actorId: null,
    name: "Новое",
    img: "",
    imageSource: "portrait",
    imageFit: "cover",
    imageAlign: "center",
    role: "",
    factionIds: [],
    primaryFactionId: null,
    scale: 1,
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    hidden: false,
    gmOnly: false,
    ...overrides,
  };
}

describe("canEditNode", () => {
  it("GM правит любой узел", () => {
    expect(canEditNode(makeNode({ id: "a", gmOnly: true }), true)).toBe(true);
  });

  it("игрок правит обычный узел, но не gmOnly (и не hidden — он всегда gmOnly)", () => {
    expect(canEditNode(makeNode({ id: "a" }), false)).toBe(true);
    expect(canEditNode(makeNode({ id: "a", gmOnly: true }), false)).toBe(false);
    expect(canEditNode(makeNode({ id: "a", hidden: true, gmOnly: true }), false)).toBe(false);
  });
});

describe("restrictNodeEdit", () => {
  const node = makeNode({ id: "a", gmNotes: "секрет", type: "image" });

  it("GM — значения формы как есть", () => {
    const v = values({ gmNotes: "новое", hidden: true, type: "actor", actorId: "act1" });
    expect(restrictNodeEdit(node, v, true)).toBe(v);
  });

  it("игрок не меняет заметки GM и флаги видимости", () => {
    const result = restrictNodeEdit(node, values({ gmNotes: "взлом", hidden: true, gmOnly: true, role: "Вор" }), false);
    expect(result).toMatchObject({ gmNotes: "секрет", hidden: false, gmOnly: false, role: "Вор" });
  });

  it("игрок не привязывает актёра, но выбирает между «без актёра» и «изображением»", () => {
    expect(restrictNodeEdit(node, values({ type: "actor", actorId: "act1" }), false)).toMatchObject({
      type: "image",
      actorId: null,
    });
    expect(restrictNodeEdit(node, values({ type: "placeholder" }), false)).toMatchObject({
      type: "placeholder",
      actorId: null,
    });
  });

  it("игрок не отвязывает и не меняет актёра у привязанного узла", () => {
    const bound = makeNode({ id: "b", type: "actor", actorId: "act1" });
    expect(restrictNodeEdit(bound, values({ type: "placeholder" }), false)).toMatchObject({
      type: "actor",
      actorId: "act1",
    });
    expect(restrictNodeEdit(bound, values({ type: "actor", actorId: "act2" }), false)).toMatchObject({
      actorId: "act1",
    });
  });
});

describe("restrictFactionEdit", () => {
  const faction: Faction = { id: "f1", name: "Стража", color: "#ff0000", description: "старое" };
  const edit = { name: "Бандиты", color: "#000000", description: "новое" };

  it("игрок меняет только описание", () => {
    expect(restrictFactionEdit(faction, edit, false)).toEqual({ name: "Стража", color: "#ff0000", description: "новое" });
  });

  it("GM — всё", () => {
    expect(restrictFactionEdit(faction, edit, true)).toEqual(edit);
  });
});

describe("planDeletion", () => {
  const data: GraphData = {
    nodes: [makeNode({ id: "a" }), makeNode({ id: "locked", gmOnly: true }), makeNode({ id: "c" })],
    edges: [
      makeEdge({ id: "e1", source: "a", target: "c" }),
      makeEdge({ id: "e2", source: "a", target: "locked", gmOnly: true }),
      makeEdge({ id: "e3", source: "locked", target: "c" }),
      makeEdge({ id: "secret", source: "c", target: "locked", gmOnly: true }),
    ],
    factions: [],
    relationshipTypes: [],
    conditions: [],
  };

  it("игрок: gmOnly-узлы и gmOnly-связи выпадают, скрытые связи не считаются", () => {
    const plan = planDeletion(data, ["a", "locked", "ghost"], ["secret", "e3"], false);
    expect(plan.nodeIds).toEqual(["a"]);
    expect(plan.edgeIds).toEqual(["e3"]);
    // e1 (связь узла a) + e3 (выбрана); e2 уйдёт с узлом a, но игрок её не видит
    expect(plan.visibleEdgeCount).toBe(2);
  });

  it("GM удаляет всё выделенное и видит полный счёт", () => {
    const plan = planDeletion(data, ["a", "locked"], ["secret"], true);
    expect(plan.nodeIds).toEqual(["a", "locked"]);
    expect(plan.edgeIds).toEqual(["secret"]);
    expect(plan.visibleEdgeCount).toBe(4);
  });

  it("пустое выделение — пустой план", () => {
    expect(planDeletion(data, [], [], true)).toEqual({ nodeIds: [], edgeIds: [], visibleEdgeCount: 0 });
  });
});

describe("visibleEdgeCount", () => {
  const data: GraphData = {
    nodes: [makeNode({ id: "a" }), makeNode({ id: "b" }), makeNode({ id: "c" })],
    edges: [
      makeEdge({ id: "e1", source: "a", target: "b" }),
      makeEdge({ id: "e2", source: "c", target: "a", gmOnly: true }),
      makeEdge({ id: "e3", source: "b", target: "c" }),
    ],
    factions: [],
    relationshipTypes: [],
    conditions: [],
  };

  it("игроку gmOnly-связи в счёт не идут", () => {
    expect(visibleEdgeCount(data, "a", false)).toBe(1);
    expect(visibleEdgeCount(data, "a", true)).toBe(2);
  });
});
