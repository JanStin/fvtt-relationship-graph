import { describe, expect, it } from "vitest";
import {
  applyEdgeEdit,
  applyFactionEdit,
  applyNodeEdit,
  createFactionFromEdit,
  normalizeFactions,
  primaryAfterUncheck,
  type NodeEditValues,
} from "../../src/core/edit";
import type { GraphData, GraphNode } from "../../src/core/model";

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

const data: GraphData = {
  nodes: [
    makeNode({ id: "free", name: "Старое", img: "old.png" }),
    makeNode({ id: "bound", type: "actor", actorId: "actor1", name: "Актёр", img: "actor.png" }),
    makeNode({ id: "member", primaryFactionId: "f1", factionIds: ["f1", "f2"] }),
    makeNode({ id: "secondaryOnly", primaryFactionId: null, factionIds: ["f2"] }),
  ],
  edges: [{ id: "e1", source: "free", target: "bound", label: "", directional: false, relationshipTypeId: "", gmOnly: false }],
  factions: [
    { id: "f1", name: "F1", color: "#111111", description: "" },
    { id: "f2", name: "F2", color: "#222222", description: "" },
  ],
  relationshipTypes: [{ id: "rt1", label: "друг", color: "#00ff00", dash: "" }],
  conditions: [],
};

function values(overrides: Partial<NodeEditValues> = {}): NodeEditValues {
  return {
    name: "Новое",
    img: "new.png",
    role: "",
    factionIds: [],
    primaryFactionId: null,
    scale: 1,
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    ...overrides,
  };
}

function nodeOf(result: GraphData, id: string): GraphNode {
  return result.nodes.find((n) => n.id === id)!;
}

describe("applyNodeEdit", () => {
  it("обновляет поля свободного узла и не мутирует вход", () => {
    const result = applyNodeEdit(
      data,
      "free",
      values({ role: " Вор ", lore: "история", gmNotes: "секрет", conditions: ["deceased"], scale: 2 }),
    );
    expect(nodeOf(result, "free")).toMatchObject({
      name: "Новое",
      img: "new.png",
      role: "Вор",
      lore: "история",
      gmNotes: "секрет",
      conditions: ["deceased"],
      scale: 2,
    });
    expect(nodeOf(data, "free").name).toBe("Старое");
  });

  it("у узла с актёром name/img не меняются", () => {
    const result = applyNodeEdit(data, "bound", values({ role: "Страж" }));
    expect(nodeOf(result, "bound")).toMatchObject({ name: "Актёр", img: "actor.png", role: "Страж" });
  });

  it("пустое имя оставляет прежнее", () => {
    expect(nodeOf(applyNodeEdit(data, "free", values({ name: "  " })), "free").name).toBe("Старое");
  });

  it("клампит scale и игнорирует NaN", () => {
    expect(nodeOf(applyNodeEdit(data, "free", values({ scale: 99 })), "free").scale).toBe(5);
    expect(nodeOf(applyNodeEdit(data, "free", values({ scale: 0 })), "free").scale).toBe(0.3);
    expect(nodeOf(applyNodeEdit(data, "free", values({ scale: NaN })), "free").scale).toBe(1);
  });

  it("смена основной фракции: основная встаёт первой, остальные сохраняются", () => {
    const result = applyNodeEdit(data, "member", values({ factionIds: ["f1", "f2"], primaryFactionId: "f2" }));
    expect(nodeOf(result, "member")).toMatchObject({ primaryFactionId: "f2", factionIds: ["f2", "f1"] });
  });

  it("пустой список фракций очищает фракции узла", () => {
    const result = applyNodeEdit(data, "member", values({ factionIds: [], primaryFactionId: "f1" }));
    expect(nodeOf(result, "member")).toMatchObject({ primaryFactionId: null, factionIds: [] });
  });

  it("добавление второй фракции не меняет основную", () => {
    const result = applyNodeEdit(data, "free", values({ factionIds: ["f2", "f1"], primaryFactionId: "f1" }));
    expect(nodeOf(result, "free")).toMatchObject({ primaryFactionId: "f1", factionIds: ["f1", "f2"] });
  });

  it("состояния: неизвестные справочнику и повторные отбрасываются", () => {
    const withCustom: GraphData = { ...data, conditions: [{ id: "cursed", label: "Проклят", icon: "fa-ghost" }] };
    const result = applyNodeEdit(withCustom, "free", values({ conditions: ["cursed", "ghost", "missing", "cursed"] }));
    expect(nodeOf(result, "free").conditions).toEqual(["cursed", "missing"]);
  });

  it("бросает на неизвестном узле", () => {
    expect(() => applyNodeEdit(data, "nope", values())).toThrow(/not found/);
  });
});

describe("normalizeFactions", () => {
  it("без отмеченных фракций основной нет", () => {
    expect(normalizeFactions(data, [], "f1")).toEqual({ factionIds: [], primaryFactionId: null });
  });

  it("основная по умолчанию — первая отмеченная", () => {
    expect(normalizeFactions(data, ["f2", "f1"], null)).toEqual({ factionIds: ["f2", "f1"], primaryFactionId: "f2" });
  });

  it("основная, не входящая в отмеченные, заменяется первой отмеченной", () => {
    expect(normalizeFactions(data, ["f2"], "f1")).toEqual({ factionIds: ["f2"], primaryFactionId: "f2" });
  });

  it("неизвестные и повторные фракции отбрасываются", () => {
    expect(normalizeFactions(data, ["ghost", "f1", "f1"], "ghost")).toEqual({
      factionIds: ["f1"],
      primaryFactionId: "f1",
    });
  });
});

describe("primaryAfterUncheck", () => {
  const order = ["a", "b", "c", "d"];

  it("роль переходит следующей отмеченной по списку", () => {
    expect(primaryAfterUncheck(order, new Set(["a", "d"]), "b")).toBe("d");
  });

  it("если ниже отмеченных нет — первой отмеченной", () => {
    expect(primaryAfterUncheck(order, new Set(["a", "b"]), "d")).toBe("a");
  });

  it("отмеченных не осталось — null", () => {
    expect(primaryAfterUncheck(order, new Set(), "b")).toBeNull();
  });
});

describe("applyFactionEdit / createFactionFromEdit", () => {
  it("обновляет название, цвет и описание", () => {
    const result = applyFactionEdit(data, "f1", { name: " Стража ", color: "#abcdef", description: "текст" });
    expect(result.factions[0]).toEqual({ id: "f1", name: "Стража", color: "#abcdef", description: "текст" });
    expect(data.factions[0].name).toBe("F1");
  });

  it("пустое имя и пустой цвет оставляют прежние", () => {
    const result = applyFactionEdit(data, "f1", { name: " ", color: "", description: "" });
    expect(result.factions[0]).toMatchObject({ name: "F1", color: "#111111" });
  });

  it("создаёт фракцию, подставляя название по умолчанию", () => {
    const result = createFactionFromEdit(data, "f3", { name: "", color: "#333333", description: "" });
    expect(result.factions[2]).toEqual({ id: "f3", name: "Новая фракция", color: "#333333", description: "" });
  });

  it("бросает на неизвестной фракции и на повторном id", () => {
    expect(() => applyFactionEdit(data, "nope", { name: "x", color: "", description: "" })).toThrow(/not found/);
    expect(() => createFactionFromEdit(data, "f1", { name: "x", color: "", description: "" })).toThrow(/already exists/);
  });
});

describe("applyEdgeEdit", () => {
  it("обновляет поля связи", () => {
    const result = applyEdgeEdit(data, "e1", {
      label: " союз ",
      relationshipTypeId: "rt1",
      directional: true,
      gmOnly: true,
    });
    expect(result.edges[0]).toMatchObject({ label: "союз", relationshipTypeId: "rt1", directional: true, gmOnly: true });
  });

  it("неизвестный тип связи сбрасывается", () => {
    const result = applyEdgeEdit(data, "e1", {
      label: "",
      relationshipTypeId: "ghost",
      directional: false,
      gmOnly: false,
    });
    expect(result.edges[0].relationshipTypeId).toBe("");
  });
});
