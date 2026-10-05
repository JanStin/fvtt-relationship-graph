import { describe, expect, it } from "vitest";
import { defaultBackground } from "../../src/core/background";
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

const PLAYER = { isGM: false };
const GM = { isGM: true };

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

    expect(buildNodeDecor(data, node, PLAYER).conditions.shown).toEqual([{ id: "cursed", icon: "fa-regular fa-star" }]);
  });

  it("узел без роли, фракций и состояний — только имя", () => {
    const node = makeNode({ id: "a", name: "Алиса" });

    expect(buildNodeDecor(makeData(node), node, PLAYER)).toEqual({
      name: "Алиса",
      role: "",
      factions: { shown: [], more: false },
      conditions: { shown: [], more: false },
      ring: false,
    });
  });

  it("узел «Правит только GM»: окольцовка у всех, остальное как обычно", () => {
    const node = makeNode({ id: "a", name: "Алиса", gmOnly: true });

    expect(buildNodeDecor(makeData(node), node, PLAYER)).toMatchObject({ name: "Алиса", ring: true });
    expect(buildNodeDecor(makeData(node), node, GM)).toMatchObject({ name: "Алиса", ring: true });
  });

  it("скрытый узел: игроку — без имени, роли и значков, GM — как есть; окольцовка у обоих", () => {
    const node = makeNode({
      id: "a",
      name: "Алиса",
      role: "Шпион",
      primaryFactionId: "f1",
      factionIds: ["f1", "f2"],
      conditions: ["deceased"],
      hidden: true,
      gmOnly: true,
    });

    expect(buildNodeDecor(makeData(node), node, PLAYER)).toEqual({
      name: "",
      role: "",
      factions: { shown: [], more: false },
      conditions: { shown: [], more: false },
      ring: true,
    });
    expect(buildNodeDecor(makeData(node), node, GM)).toMatchObject({
      name: "Алиса",
      role: "Шпион",
      factions: { shown: ["#f2"], more: false },
      ring: true,
    });
  });

  it("роль из одних пробелов считается пустой", () => {
    const node = makeNode({ id: "a", role: "  " });

    expect(buildNodeDecor(makeData(node), node, PLAYER).role).toBe("");
  });

  it("основная фракция ромбиком не помечается", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "f2", "f3"] });

    expect(buildNodeDecor(makeData(node), node, PLAYER).factions).toEqual({ shown: ["#f2", "#f3"], more: false });
  });

  it("неизвестная фракция пропускается", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "ghost", "f2"] });

    expect(buildNodeDecor(makeData(node), node, PLAYER).factions).toEqual({ shown: ["#f2"], more: false });
  });

  it("больше трёх дополнительных фракций — две и плюс", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "f2", "f3", "f4", "f5"] });

    expect(buildNodeDecor(makeData(node), node, PLAYER).factions).toEqual({ shown: ["#f2", "#f3"], more: true });
  });

  it("состояния получают иконки и ограничиваются так же", () => {
    const node = makeNode({ id: "a", conditions: ["deceased", "custom", "missing", "captured"] });

    expect(buildNodeDecor(makeData(node), node, PLAYER).conditions).toEqual({
      shown: [
        { id: "deceased", icon: "fa-solid fa-skull" },
        { id: "custom", icon: "fa-solid fa-tag" }, // нет в справочнике — иконка по умолчанию
      ],
      more: true,
    });
  });

  it("дополнительные фракции «областями» — ромбиков нет", () => {
    const node = makeNode({ id: "a", primaryFactionId: "f1", factionIds: ["f1", "f2", "f3"] });
    const data = { ...makeData(node), background: { ...defaultBackground(), factionDisplay: "areas" as const } };

    expect(buildNodeDecor(makeData(node), node, PLAYER).factions.shown).toEqual(["#f2", "#f3"]);
    expect(buildNodeDecor(data, node, PLAYER).factions).toEqual({ shown: [], more: false });
  });
});
