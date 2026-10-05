import { describe, expect, it } from "vitest";
import { defaultBackground } from "../../src/core/background";
import { factionAreas, nodeAreaFactionIds, pickArea } from "../../src/core/faction-areas";
import type { FactionDisplay, GraphData, GraphNode } from "../../src/core/model";

function makeNode(id: string, factionIds: string[]): GraphNode {
  return {
    id,
    type: "actor",
    actorId: null,
    name: id,
    originalName: "",
    img: "",
    x: 0,
    y: 0,
    scale: 1.0,
    primaryFactionId: factionIds[0] ?? null,
    factionIds,
    role: "",
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    hidden: false,
    gmOnly: false,
  };
}

function makeData(nodes: GraphNode[], factionDisplay?: FactionDisplay): GraphData {
  return {
    nodes,
    edges: [],
    factions: ["f1", "f2", "f3"].map((id) => ({ id, name: id, color: `#${id}`, description: "" })),
    relationshipTypes: [],
    conditions: [],
    background: factionDisplay ? { ...defaultBackground(), factionDisplay } : null,
  };
}

describe("nodeAreaFactionIds", () => {
  const node = makeNode("a", ["f1", "f2", "gone"]);

  it("ромбики (и графы без настройки) — только основная фракция", () => {
    expect(nodeAreaFactionIds(node, makeData([node]))).toEqual(["f1"]);
    expect(nodeAreaFactionIds(node, makeData([node], "badges"))).toEqual(["f1"]);
  });

  it("областями — все фракции узла, неизвестные пропускаются", () => {
    expect(nodeAreaFactionIds(node, makeData([node], "areas"))).toEqual(["f1", "f2"]);
  });

  it("узел без фракций ни в одной области", () => {
    expect(nodeAreaFactionIds(makeNode("b", []), makeData([], "areas"))).toEqual([]);
  });
});

describe("factionAreas", () => {
  const nodes = [makeNode("a", ["f1", "f3"]), makeNode("b", ["f2"]), makeNode("c", ["f1"])];

  it("ромбики — области только основных фракций, фракция без узлов не рисуется", () => {
    expect(factionAreas(makeData(nodes))).toEqual([
      { factionId: "f1", nodeIds: ["a", "c"] },
      { factionId: "f2", nodeIds: ["b"] },
    ]);
  });

  it("областями — фракция, которая ни у кого не основная, тоже получает область", () => {
    expect(factionAreas(makeData(nodes, "areas"))).toEqual([
      { factionId: "f1", nodeIds: ["a", "c"] },
      { factionId: "f2", nodeIds: ["b"] },
      { factionId: "f3", nodeIds: ["a"] },
    ]);
  });
});

describe("pickArea", () => {
  it("в перекрытии — основная фракция ближайшего узла, если её область под точкой", () => {
    expect(pickArea(["faction-f2", "faction-f1"], "faction-f1")).toBe("faction-f1");
  });

  it("основной области ближайшего узла под точкой нет — самая глубокая", () => {
    expect(pickArea(["faction-f2", "faction-f1"], "faction-f3")).toBe("faction-f2");
    expect(pickArea(["faction-f2", "faction-f1"], null)).toBe("faction-f2");
  });

  it("вне областей — null", () => {
    expect(pickArea([], "faction-f1")).toBeNull();
  });
});
