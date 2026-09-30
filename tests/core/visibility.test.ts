import { describe, expect, it } from "vitest";
import type { GraphData, GraphNode } from "../../src/core/model";
import {
  displayName,
  ensureNodeFlags,
  isMasked,
  normalizeNodeFlags,
  UNKNOWN_NODE_NAME,
} from "../../src/core/visibility";

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

function makeData(nodes: GraphNode[]): GraphData {
  return { nodes, edges: [], factions: [], relationshipTypes: [], conditions: [] };
}

describe("normalizeNodeFlags", () => {
  it("hidden включает gmOnly", () => {
    expect(normalizeNodeFlags({ hidden: true, gmOnly: false })).toEqual({ hidden: true, gmOnly: true });
  });

  it("остальные сочетания не меняются", () => {
    expect(normalizeNodeFlags({ hidden: false, gmOnly: false })).toEqual({ hidden: false, gmOnly: false });
    expect(normalizeNodeFlags({ hidden: false, gmOnly: true })).toEqual({ hidden: false, gmOnly: true });
    expect(normalizeNodeFlags({ hidden: true, gmOnly: true })).toEqual({ hidden: true, gmOnly: true });
  });
});

describe("ensureNodeFlags", () => {
  it("hidden-узел без gmOnly получает gmOnly, вход не мутируется", () => {
    const data = makeData([makeNode({ id: "a", hidden: true }), makeNode({ id: "b" })]);
    const result = ensureNodeFlags(data);

    expect(result.nodes[0]).toMatchObject({ hidden: true, gmOnly: true });
    expect(result.nodes[1]).toBe(data.nodes[1]);
    expect(data.nodes[0].gmOnly).toBe(false);
  });

  it("узел без флагов (старые данные) получает false", () => {
    const legacy = makeNode({ id: "a" }) as Partial<GraphNode>;
    delete legacy.hidden;
    delete legacy.gmOnly;

    expect(ensureNodeFlags(makeData([legacy as GraphNode])).nodes[0]).toMatchObject({ hidden: false, gmOnly: false });
  });

  it("если править нечего — возвращает тот же объект", () => {
    const data = makeData([makeNode({ id: "a", hidden: true, gmOnly: true }), makeNode({ id: "b", gmOnly: true })]);
    expect(ensureNodeFlags(data)).toBe(data);
  });
});

describe("isMasked / displayName", () => {
  const hidden = makeNode({ id: "a", name: "Алиса", hidden: true, gmOnly: true });
  const gmOnly = makeNode({ id: "b", name: "Боб", gmOnly: true });

  it("скрытый узел замаскирован только для игрока", () => {
    expect(isMasked(hidden, false)).toBe(true);
    expect(isMasked(hidden, true)).toBe(false);
    expect(displayName(hidden, false)).toBe(UNKNOWN_NODE_NAME);
    expect(displayName(hidden, true)).toBe("Алиса");
  });

  it("gmOnly-узел игроку виден как обычно", () => {
    expect(isMasked(gmOnly, false)).toBe(false);
    expect(displayName(gmOnly, false)).toBe("Боб");
  });
});
