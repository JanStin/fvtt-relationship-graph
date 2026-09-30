import { describe, expect, it } from "vitest";
import { buildNodeDecor, limitBadges } from "../../src/core/decor";
import type { GraphData, GraphNode } from "../../src/core/model";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "actor",
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

function makeData(node: GraphNode): GraphData {
  return {
    nodes: [node],
    edges: [],
    factions: ["f1", "f2", "f3", "f4", "f5"].map((id) => ({
      id,
      name: id,
      color: `#${id}`,
      description: "",
    })),
    relationshipTypes: [],
    conditions: [],
  };
}

describe("limitBadges", () => {
  it("до трёх значков показывает как есть", () => {
    expect(limitBadges([])).toEqual({ shown: [], more: false });
    expect(limitBadges([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: false });
  });

  it("больше трёх — первые два и плюс", () => {
    expect(limitBadges([1, 2, 3, 4])).toEqual({ shown: [1, 2], more: true });
    expect(limitBadges([1, 2, 3, 4, 5, 6])).toEqual({ shown: [1, 2], more: true });
  });
});

describe("buildNodeDecor", () => {
  it("иконка своего состояния берётся из справочника", () => {
    const node = makeNode({ id: "a", conditions: ["cursed"] });
    const data = { ...makeData(node), conditions: [{ id: "cursed", label: "Проклят", icon: "fa-regular fa-star" }] };

    expect(buildNodeDecor(data, node).conditions.shown).toEqual([{ id: "cursed", icon: "fa-regular fa-star" }]);
  });

  it("узел без роли, фракций и состояний — только имя", () => {
    const node = makeNode({ id: "a", name: "Алиса" });

    expect(buildNodeDecor(makeData(node), node)).toEqual({
      name: "Алиса",
      role: "",
      factions: { shown: [], more: false },
      conditions: { shown: [], more: false },
    });
  });

  it("роль из одних пробелов считается пустой", () => {
    const node = makeNode({ id: "a", role: "  " });

    expect(buildNodeDecor(makeData(node), node).role).toBe("");
  });

  it("основная фракция ромбиком не помечается", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "f2", "f3"] });

    expect(buildNodeDecor(makeData(node), node).factions).toEqual({ shown: ["#f2", "#f3"], more: false });
  });

  it("неизвестная фракция пропускается", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "ghost", "f2"] });

    expect(buildNodeDecor(makeData(node), node).factions).toEqual({ shown: ["#f2"], more: false });
  });

  it("больше трёх дополнительных фракций — две и плюс", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "f2", "f3", "f4", "f5"] });

    expect(buildNodeDecor(makeData(node), node).factions).toEqual({ shown: ["#f2", "#f3"], more: true });
  });

  it("состояния получают иконки и ограничиваются так же", () => {
    const node = makeNode({ id: "a", conditions: ["deceased", "custom", "missing", "captured"] });

    expect(buildNodeDecor(makeData(node), node).conditions).toEqual({
      shown: [
        { id: "deceased", icon: "fa-solid fa-skull" },
        { id: "custom", icon: "fa-solid fa-tag" }, // нет в справочнике — иконка по умолчанию
      ],
      more: true,
    });
  });
});
