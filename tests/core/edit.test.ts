import { describe, expect, it } from "vitest";
import { applyEdgeEdit, applyNodeEdit, parseConditions, type NodeEditValues } from "../../src/core/edit";
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
    { id: "f1", name: "F1", color: "#111111", description: "", visible: true },
    { id: "f2", name: "F2", color: "#222222", description: "", visible: true },
  ],
  relationshipTypes: [{ id: "rt1", label: "друг", color: "#00ff00", dash: "" }],
};

function values(overrides: Partial<NodeEditValues> = {}): NodeEditValues {
  return {
    name: "Новое",
    img: "new.png",
    role: "",
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

describe("parseConditions", () => {
  it("режет по запятым, обрезает пробелы, выкидывает пустые", () => {
    expect(parseConditions("ранен,  отравлен, ,")).toEqual(["ранен", "отравлен"]);
    expect(parseConditions("   ")).toEqual([]);
  });
});

describe("applyNodeEdit", () => {
  it("обновляет поля свободного узла и не мутирует вход", () => {
    const result = applyNodeEdit(
      data,
      "free",
      values({ role: " Вор ", lore: "история", gmNotes: "секрет", conditions: ["ранен"], scale: 2 }),
    );
    expect(nodeOf(result, "free")).toMatchObject({
      name: "Новое",
      img: "new.png",
      role: "Вор",
      lore: "история",
      gmNotes: "секрет",
      conditions: ["ранен"],
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

  it("смена primary-фракции сохраняет остальные как вторичные", () => {
    const result = applyNodeEdit(data, "member", values({ primaryFactionId: "f2" }));
    expect(nodeOf(result, "member")).toMatchObject({ primaryFactionId: "f2", factionIds: ["f2", "f1"] });
  });

  it("выбор 'без фракции' очищает фракции узла", () => {
    const result = applyNodeEdit(data, "member", values({ primaryFactionId: null }));
    expect(nodeOf(result, "member")).toMatchObject({ primaryFactionId: null, factionIds: [] });
  });

  it("неизменённая фракция не трогает factionIds", () => {
    const kept = applyNodeEdit(data, "member", values({ primaryFactionId: "f1" }));
    expect(nodeOf(kept, "member").factionIds).toEqual(["f1", "f2"]);
    const stillNone = applyNodeEdit(data, "secondaryOnly", values({ primaryFactionId: null }));
    expect(nodeOf(stillNone, "secondaryOnly").factionIds).toEqual(["f2"]);
  });

  it("бросает на неизвестном узле", () => {
    expect(() => applyNodeEdit(data, "nope", values())).toThrow(/not found/);
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
