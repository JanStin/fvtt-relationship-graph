import { describe, expect, it } from "vitest";
import {
  addEdge,
  addNode,
  moveFaction,
  removeEdge,
  removeNode,
  updateEdge,
  updateNode,
} from "../../src/core/graph-state";
import type { GraphData, GraphEdge, GraphNode } from "../../src/core/model";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "actor",
    actorId: null,
    name: "",
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
  return {
    label: "",
    directional: false,
    relationshipTypeId: "",
    gmOnly: false,
    ...overrides,
  };
}

function makeData(): GraphData {
  return {
    nodes: [makeNode({ id: "n1" }), makeNode({ id: "n2" })],
    edges: [makeEdge({ id: "e1", source: "n1", target: "n2" })],
    factions: [
      { id: "f1", name: "Fraction 1", color: "#111", description: "", visible: true },
      { id: "f2", name: "Fraction 2", color: "#222", description: "", visible: true },
    ],
    relationshipTypes: [],
  };
}

describe("addNode", () => {
  it("добавляет новый узел, не мутируя исходные данные", () => {
    const data = makeData();
    const next = addNode(data, makeNode({ id: "n3" }));

    expect(next.nodes.map((n) => n.id)).toEqual(["n1", "n2", "n3"]);
    expect(data.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
  });

  it("бросает ошибку при дублирующемся id", () => {
    const data = makeData();
    expect(() => addNode(data, makeNode({ id: "n1" }))).toThrow();
  });
});

describe("removeNode", () => {
  it("удаляет узел и каскадно связанные с ним рёбра", () => {
    const data = makeData();
    const next = removeNode(data, "n1");

    expect(next.nodes.map((n) => n.id)).toEqual(["n2"]);
    expect(next.edges).toEqual([]); // e1 ссылался на n1
  });

  it("тихий no-op, если узла нет", () => {
    const data = makeData();
    const next = removeNode(data, "does-not-exist");
    expect(next.nodes).toEqual(data.nodes);
    expect(next.edges).toEqual(data.edges);
  });
});

describe("updateNode", () => {
  it("частично обновляет узел, id не меняется даже если передан в patch", () => {
    const data = makeData();
    const next = updateNode(data, "n1", { name: "Новое имя", id: "hacked" } as never);

    const updated = next.nodes.find((n) => n.id === "n1")!;
    expect(updated.name).toBe("Новое имя");
    expect(updated.id).toBe("n1");
    expect(next.nodes.find((n) => n.id === "n2")).toEqual(data.nodes.find((n) => n.id === "n2"));
  });

  it("бросает ошибку, если узел не найден", () => {
    const data = makeData();
    expect(() => updateNode(data, "missing", { name: "x" })).toThrow();
  });
});

describe("addEdge", () => {
  it("добавляет связь между существующими узлами", () => {
    const data = makeData();
    const next = addEdge(data, makeEdge({ id: "e2", source: "n2", target: "n1" }));
    expect(next.edges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("бросает ошибку при дублирующемся id связи", () => {
    const data = makeData();
    expect(() => addEdge(data, makeEdge({ id: "e1", source: "n1", target: "n2" }))).toThrow();
  });

  it("бросает ошибку, если source не существует", () => {
    const data = makeData();
    expect(() => addEdge(data, makeEdge({ id: "e2", source: "missing", target: "n2" }))).toThrow();
  });

  it("бросает ошибку, если target не существует", () => {
    const data = makeData();
    expect(() => addEdge(data, makeEdge({ id: "e2", source: "n1", target: "missing" }))).toThrow();
  });
});

describe("removeEdge", () => {
  it("удаляет связь по id", () => {
    const data = makeData();
    expect(removeEdge(data, "e1").edges).toEqual([]);
  });

  it("тихий no-op, если связи нет", () => {
    const data = makeData();
    expect(removeEdge(data, "missing").edges).toEqual(data.edges);
  });
});

describe("updateEdge", () => {
  it("частично обновляет связь", () => {
    const data = makeData();
    const next = updateEdge(data, "e1", { label: "враги", directional: true });
    expect(next.edges[0]).toMatchObject({ id: "e1", label: "враги", directional: true });
  });

  it("бросает ошибку, если связь не найдена", () => {
    const data = makeData();
    expect(() => updateEdge(data, "missing", { label: "x" })).toThrow();
  });
});

describe("moveFaction", () => {
  it("назначает primary-фракцию узлу без фракций", () => {
    const data = makeData();
    const next = moveFaction(data, "n1", "f1");
    const node = next.nodes.find((n) => n.id === "n1")!;
    expect(node.primaryFactionId).toBe("f1");
    expect(node.factionIds).toEqual(["f1"]);
  });

  it("новая primary-фракция становится первой, старые сохраняются как вторичные", () => {
    const data = makeData();
    const withFaction = moveFaction(data, "n1", "f1"); // factionIds: [f1]
    // добавим вторую фракцию вручную как если бы узел уже состоял в двух
    const twoFactions: GraphData = {
      ...withFaction,
      nodes: withFaction.nodes.map((n) => (n.id === "n1" ? { ...n, factionIds: ["f1", "f2"] } : n)),
    };

    const next = moveFaction(twoFactions, "n1", "f2");
    const node = next.nodes.find((n) => n.id === "n1")!;
    expect(node.primaryFactionId).toBe("f2");
    expect(node.factionIds).toEqual(["f2", "f1"]);
  });

  it("factionId=null полностью очищает фракции узла", () => {
    const data = makeData();
    const withFaction = moveFaction(data, "n1", "f1");
    const cleared = moveFaction(withFaction, "n1", null);
    const node = cleared.nodes.find((n) => n.id === "n1")!;
    expect(node.primaryFactionId).toBeNull();
    expect(node.factionIds).toEqual([]);
  });

  it("бросает ошибку для несуществующей фракции", () => {
    const data = makeData();
    expect(() => moveFaction(data, "n1", "ghost")).toThrow();
  });

  it("бросает ошибку для несуществующего узла", () => {
    const data = makeData();
    expect(() => moveFaction(data, "missing", "f1")).toThrow();
  });
});
