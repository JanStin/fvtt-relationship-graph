import { describe, expect, it } from "vitest";
import { describeFaction, describeNode } from "../../src/core/describe";
import type { GraphData, GraphEdge, GraphNode } from "../../src/core/model";

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

function makeEdge(overrides: Partial<GraphEdge> & { id: string; source: string; target: string }): GraphEdge {
  return { label: "", directional: false, relationshipTypeId: "", gmOnly: false, ...overrides };
}

const data: GraphData = {
  nodes: [
    makeNode({
      id: "a",
      name: "Алиса",
      role: "Капитан",
      factionIds: ["f1", "missing"],
      primaryFactionId: "f1",
      gmNotes: "секрет",
      scale: 1.5,
    }),
    makeNode({ id: "b", name: "Боб", type: "placeholder", factionIds: ["f1"], primaryFactionId: "f1" }),
    makeNode({ id: "c", name: "Карл" }),
  ],
  edges: [
    makeEdge({ id: "e1", source: "a", target: "b", directional: true, label: "командует" }),
    makeEdge({ id: "e2", source: "c", target: "a", directional: true, relationshipTypeId: "rt1" }),
    makeEdge({ id: "e3", source: "a", target: "c", gmOnly: true, label: "шпионит" }),
  ],
  factions: [{ id: "f1", name: "Стража", color: "#ff0000", description: "Городская стража" }],
  relationshipTypes: [{ id: "rt1", label: "враг", color: "#000000", dash: "" }],
};

function rowValue(rows: { label: string; value: string }[], labelStart: string): string | undefined {
  return rows.find((r) => r.label.startsWith(labelStart))?.value;
}

describe("describeNode", () => {
  it("возвращает null для неизвестного узла", () => {
    expect(describeNode(data, "nope", { isGM: true })).toBeNull();
  });

  it("собирает заголовок, тип, роль, фракции и размер", () => {
    const d = describeNode(data, "a", { isGM: false })!;
    expect(d.title).toBe("Алиса");
    expect(d.subtitle).toBe("Актёр");
    expect(rowValue(d.rows, "Роль")).toBe("Капитан");
    expect(rowValue(d.rows, "Фракции")).toBe("Стража"); // несуществующая фракция пропущена
    expect(rowValue(d.rows, "Размер")).toBe("×1.5");
  });

  it("при нескольких фракциях помечает основную", () => {
    const many: GraphData = {
      ...data,
      factions: [...data.factions, { id: "f2", name: "Гильдия", color: "#00ff00", description: "" }],
      nodes: [makeNode({ id: "x", factionIds: ["f2", "f1"], primaryFactionId: "f2" })],
    };
    expect(rowValue(describeNode(many, "x", { isGM: false })!.rows, "Фракции")).toBe("Гильдия (основная), Стража");
  });

  it("описывает связи: направление, подпись или название типа", () => {
    const d = describeNode(data, "a", { isGM: false })!;
    expect(rowValue(d.rows, "Связи")).toBe("→ Боб: командует\n← Карл: враг");
  });

  it("GM-only связи и заметки GM видит только GM", () => {
    const player = describeNode(data, "a", { isGM: false })!;
    expect(player.rows.some((r) => r.label === "Заметки GM")).toBe(false);
    expect(player.rows.some((r) => r.label === "Связи (2)")).toBe(true);

    const gm = describeNode(data, "a", { isGM: true })!;
    expect(rowValue(gm.rows, "Заметки GM")).toBe("секрет");
    expect(rowValue(gm.rows, "Связи (3)")).toContain("— Карл: шпионит");
  });

  it("пустые поля не попадают в строки", () => {
    const d = describeNode(data, "b", { isGM: true })!;
    expect(d.subtitle).toBe("Без актёра");
    expect(d.rows.map((r) => r.label)).toEqual(["Фракции", "Связи (1)", "Размер"]);
  });
});

describe("describeFaction", () => {
  it("возвращает null для неизвестной фракции", () => {
    expect(describeFaction(data, "nope")).toBeNull();
  });

  it("собирает описание и список участников", () => {
    const d = describeFaction(data, "f1")!;
    expect(d.title).toBe("Стража");
    expect(d.rows).toEqual([
      { label: "Описание", value: "Городская стража" },
      { label: "Участники (2)", value: "Алиса\nБоб" },
    ]);
  });
});
