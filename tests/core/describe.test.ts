import { describe, expect, it } from "vitest";
import {
  describeEdge,
  describeFaction,
  describeNode,
  LINK_GROUP_THRESHOLD,
  previewNode,
  type Description,
  type DescriptionBlock,
} from "../../src/core/describe";
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
  conditions: [],
};

const ARROWS = { out: "→", in: "←", both: "↔", none: "—" } as const;

/** Блок одной строкой: текст как есть, чипы через запятую (основная — со *), ссылки по строкам через « | ». */
function summary(block: DescriptionBlock): string {
  if (block.kind === "text") return block.text;
  if (block.kind === "chips") return block.chips.map((c) => (c.primary ? `${c.label}*` : c.label)).join(", ");
  return block.links
    .map((l) => `${l.stroke ? `${ARROWS[l.direction]} ` : ""}${l.label}${l.caption ? `: ${l.caption}` : ""}`)
    .join(" | ");
}

function blockOf(d: Description, labelStart: string): DescriptionBlock | undefined {
  return d.blocks.find((b) => b.label.startsWith(labelStart));
}

function value(d: Description, labelStart: string): string | undefined {
  const block = blockOf(d, labelStart);
  return block && summary(block);
}

function labels(d: Description): string[] {
  return d.blocks.map((b) => b.label);
}

describe("describeNode", () => {
  it("возвращает null для неизвестного узла", () => {
    expect(describeNode(data, "nope", { isGM: true })).toBeNull();
  });

  it("шапка: имя, тип, роль и портрет; размера в сведениях нет", () => {
    const d = describeNode(data, "a", { isGM: false })!;
    expect(d.title).toBe("Алиса");
    expect(d.subtitle).toBe("Актёр");
    expect(d.header).toEqual({
      kind: "node",
      portrait: { img: "", fit: "cover", align: "center", border: "#ff0000" },
      role: "Капитан",
    });
    expect(value(d, "Роль")).toBeUndefined(); // роль — в шапке
    expect(value(d, "Размер")).toBeUndefined();
    expect(d.empty).toBeUndefined();
  });

  it("фракции — чипами с цветом и переходом к фракции; несуществующая пропущена", () => {
    const d = describeNode(data, "a", { isGM: false })!;
    const block = blockOf(d, "Фракции");
    expect(block).toEqual({
      kind: "chips",
      id: "factions",
      label: "Фракции",
      chips: [{ label: "Стража", color: "#ff0000", primary: false, target: { kind: "faction", id: "f1" } }],
    });
  });

  it("при нескольких фракциях выделяет основную; порядок — справочника", () => {
    const many: GraphData = {
      ...data,
      factions: [...data.factions, { id: "f2", name: "Гильдия", color: "#00ff00", description: "" }],
      nodes: [makeNode({ id: "x", factionIds: ["f2", "f1"], primaryFactionId: "f2" })],
    };
    expect(value(describeNode(many, "x", { isGM: false })!, "Фракции")).toBe("Стража, Гильдия*");
  });

  it("состояния — чипами с названием и иконкой из справочника", () => {
    const withConditions: GraphData = {
      ...data,
      conditions: [{ id: "cursed", label: "Проклят", icon: "fa-ghost" }],
      nodes: [makeNode({ id: "x", conditions: ["deceased", "cursed", "неизвестное"] })],
    };
    const block = blockOf(describeNode(withConditions, "x", { isGM: false })!, "Состояния");
    expect(block?.kind === "chips" && block.chips).toEqual([
      { label: "Мёртв", icon: "fa-solid fa-skull" },
      { label: "Проклят", icon: "fa-solid fa-ghost" },
      { label: "неизвестное", icon: expect.stringContaining("fa-solid") },
    ]);
  });

  it("чипы состояний — в порядке справочника, а не в порядке отметки у узла", () => {
    const ordered: GraphData = {
      ...data,
      conditions: [{ id: "cursed", label: "Проклят", icon: "fa-ghost" }],
      conditionOrder: ["cursed", "deceased"],
      nodes: [makeNode({ id: "x", conditions: ["deceased", "cursed"] })],
    };
    expect(value(describeNode(ordered, "x", { isGM: false })!, "Состояния")).toBe("Проклят, Мёртв");
  });

  it("связи — ссылками на соседей: направление, подпись или тип, полоска типа", () => {
    const d = describeNode(data, "a", { isGM: false })!;
    expect(value(d, "Связи")).toBe("→ Боб: командует | ← Карл: враг");
    const block = blockOf(d, "Связи");
    expect(block?.kind === "links" && block.links[1]).toEqual({
      label: "Карл",
      caption: "враг",
      nodeId: "c",
      edgeId: "e2",
      direction: "in",
      stroke: { color: "#000000", dash: null, gmOnly: false },
      portrait: null,
    });
    expect(block?.kind === "links" && block.groups).toBeUndefined();
  });

  it("GM-only связи и заметки GM видит только GM", () => {
    const player = describeNode(data, "a", { isGM: false })!;
    expect(labels(player)).not.toContain("Заметки GM");
    expect(labels(player)).toContain("Связи (2)");

    const gm = describeNode(data, "a", { isGM: true })!;
    expect(value(gm, "Заметки GM")).toBe("секрет");
    expect(value(gm, "Связи (3)")).toContain("— Карл: шпионит");
  });

  it("порядок по важности: описание, заметки, фракции, состояния, связи", () => {
    const full: GraphData = {
      ...data,
      nodes: data.nodes.map((n) =>
        n.id === "a" ? { ...n, lore: "о ней", playerNotes: "заметка", conditions: ["deceased"], hidden: true } : n,
      ),
    };
    expect(labels(describeNode(full, "a", { isGM: true })!)).toEqual([
      "Описание",
      "Заметки",
      "Заметки GM",
      "Фракции",
      "Состояния",
      "Связи (3)",
    ]);
  });

  it("пустые поля не попадают в блоки", () => {
    const d = describeNode(data, "b", { isGM: true })!;
    expect(d.subtitle).toBe("Без актёра");
    expect(labels(d)).toEqual(["Фракции", "Связи (1)"]);
  });

  it(`больше ${LINK_GROUP_THRESHOLD} связей — группами по типу, без типа — последними`, () => {
    const others = Array.from({ length: LINK_GROUP_THRESHOLD + 1 }, (_, i) => makeNode({ id: `n${i}` }));
    const many: GraphData = {
      ...data,
      nodes: [makeNode({ id: "hub" }), ...others],
      relationshipTypes: [
        { id: "rt1", label: "враг", color: "#000000", dash: "" },
        { id: "rt2", label: "друг", color: "#00ff00", dash: "4,4" },
      ],
      edges: others.map((n, i) =>
        makeEdge({ id: `e${i}`, source: "hub", target: n.id, relationshipTypeId: i < 3 ? "" : i < 5 ? "rt2" : "rt1" }),
      ),
    };
    const block = blockOf(describeNode(many, "hub", { isGM: false })!, "Связи");
    expect(block?.kind).toBe("links");
    if (block?.kind !== "links") return;
    expect(block.links).toHaveLength(LINK_GROUP_THRESHOLD + 1);
    expect(block.groups?.map((g) => [g.label, g.color, g.links.length])).toEqual([
      ["враг", "#000000", 4],
      ["друг", "#00ff00", 2],
      ["Без типа", null, 3],
    ]);
    expect(block.groups?.[1].links[0].stroke).toEqual({ color: "#00ff00", dash: [4, 4], gmOnly: false });
  });

  it("узел без роли, текста, фракций и связей — пустое состояние с подсказкой тому, кто может править", () => {
    const lonely: GraphData = { ...data, edges: [], nodes: [makeNode({ id: "x" }), makeNode({ id: "y", gmOnly: true })] };
    expect(describeNode(lonely, "x", { isGM: false })!.empty).toEqual({ hint: expect.stringContaining("редактирования") });
    // gmOnly-узел игрок не правит — подсказки нет
    expect(describeNode(lonely, "y", { isGM: false })!.empty).toEqual({ hint: null });
    // роль уже есть — это не пусто
    const withRole: GraphData = { ...lonely, nodes: [makeNode({ id: "x", role: "Кузнец" })] };
    expect(describeNode(withRole, "x", { isGM: false })!.empty).toBeUndefined();
  });
});

/** Тот же граф, но Алиса скрыта от игроков. */
const withHidden: GraphData = {
  ...data,
  nodes: data.nodes.map((n) => (n.id === "a" ? { ...n, hidden: true, gmOnly: true, lore: "тайна" } : n)),
};

describe("describeNode: флаги видимости", () => {
  it("скрытый узел у игрока — «Неизвестный»: только связи, заглушка вместо картинки", () => {
    const d = describeNode({ ...withHidden, nodes: withHidden.nodes.map((n) => ({ ...n, img: "secret.png" })) }, "a", {
      isGM: false,
    })!;
    expect(d.header).toEqual({ kind: "node", portrait: { img: "", fit: "cover", align: "center", border: null }, role: "" });
    expect(d.title).toBe("Неизвестный");
    expect(d.subtitle).toBeUndefined();
    expect(d.visibility).toBeUndefined();
    expect(labels(d)).toEqual(["Связи (2)"]);
  });

  it("скрытый узел без связей у игрока — пустое состояние без подсказки", () => {
    const lonely: GraphData = { ...withHidden, edges: [] };
    expect(describeNode(lonely, "a", { isGM: false })!.empty).toEqual({ hint: null });
  });

  it("GM видит скрытый узел как есть, со значком видимости", () => {
    const d = describeNode(withHidden, "a", { isGM: true })!;
    expect(d.title).toBe("Алиса");
    expect(value(d, "Описание")).toBe("тайна");
    expect(d.visibility).toEqual({ icon: "fa-eye-slash", label: "Скрыт от игроков" });
  });

  it("в связях соседа скрытый узел у игрока назван «Неизвестный»", () => {
    expect(value(describeNode(withHidden, "b", { isGM: false })!, "Связи")).toBe("← Неизвестный: командует");
    expect(value(describeNode(withHidden, "b", { isGM: true })!, "Связи")).toBe("← Алиса: командует");
  });

  it("gmOnly-узел игроку виден как обычно; значок видит только GM", () => {
    const gmOnly: GraphData = { ...data, nodes: data.nodes.map((n) => (n.id === "a" ? { ...n, gmOnly: true } : n)) };

    const player = describeNode(gmOnly, "a", { isGM: false })!;
    expect(player.title).toBe("Алиса");
    expect(player.header).toMatchObject({ kind: "node", role: "Капитан" });
    expect(player.visibility).toBeUndefined();

    expect(describeNode(gmOnly, "a", { isGM: true })!.visibility).toEqual({ icon: "fa-user-lock", label: "Правит только GM" });
  });
});

describe("describeEdge", () => {
  it("подпись в заголовке, концы — ссылками, тип — чипом с цветом", () => {
    const d = describeEdge(data, "e2", { isGM: false })!;
    expect(d.title).toBe("Связь");
    expect(value(d, "Кто с кем")).toBe("Карл | Алиса: Капитан");
    const ends = blockOf(d, "Кто с кем");
    expect(ends?.kind === "links" && ends.links.map((l) => [l.nodeId, l.edgeId])).toEqual([
      ["c", null],
      ["a", null],
    ]);
    expect(blockOf(d, "Тип")).toEqual({ kind: "chips", id: "type", label: "Тип", chips: [{ label: "враг", color: "#000000" }] });
    expect(d.header).toMatchObject({ kind: "edge", directional: true, color: "#000000", dash: null, gmOnly: false });

    expect(describeEdge(data, "e1", { isGM: false })!.title).toBe("командует");
    // концы — с миниатюрой, как результаты поиска
    expect(ends?.kind === "links" && ends.links[1].portrait).toMatchObject({ border: "#ff0000" });
  });

  it("gmOnly-связь игроку не описывается, GM — со значком", () => {
    expect(describeEdge(data, "e3", { isGM: false })).toBeNull();
    expect(describeEdge(data, "e3", { isGM: true })!.visibility).toEqual({ icon: "fa-eye-slash", label: "Видна только GM" });
  });

  it("скрытый конец у игрока — «Неизвестный», без роли", () => {
    const d = describeEdge(withHidden, "e1", { isGM: false })!;
    expect(value(d, "Кто с кем")).toBe("Неизвестный | Боб");
    // миниатюра скрытого конца — заглушка без цвета фракции, у видимого — рамка его фракции
    expect(d.header).toMatchObject({ source: { img: "", border: null }, target: { border: "#ff0000" } });
  });

  it("неизвестная связь — null", () => {
    expect(describeEdge(data, "nope", { isGM: true })).toBeNull();
  });
});

describe("describeFaction", () => {
  it("возвращает null для неизвестной фракции", () => {
    expect(describeFaction(data, "nope", { isGM: true })).toBeNull();
  });

  it("описание и участники — ссылками с ролью", () => {
    const d = describeFaction(data, "f1", { isGM: false })!;
    expect(d.title).toBe("Стража");
    expect(d.header).toEqual({ kind: "faction", color: "#ff0000" });
    expect(labels(d)).toEqual(["Описание", "Участники (2)"]);
    expect(value(d, "Описание")).toBe("Городская стража");
    expect(value(d, "Участники")).toBe("Алиса: Капитан | Боб");
  });

  it("скрытый участник у игрока — «Неизвестный», у GM — по имени", () => {
    const player = describeFaction(withHidden, "f1", { isGM: false })!;
    expect(value(player, "Участники")).toBe("Неизвестный | Боб");
    // миниатюра скрытого участника — заглушка
    const members = blockOf(player, "Участники");
    expect(members?.kind === "links" && members.links[0].portrait).toEqual({ img: "", fit: "cover", align: "center", border: null });
    expect(value(describeFaction(withHidden, "f1", { isGM: true })!, "Участники")).toBe("Алиса: Капитан | Боб");
  });

  it("дополнительные фракции скрытого узла игроку не выдаются", () => {
    const extra: GraphData = {
      ...withHidden,
      nodes: withHidden.nodes.map((n) => (n.id === "a" ? { ...n, factionIds: ["f2", "f1"], primaryFactionId: "f2" } : n)),
    };
    expect(value(describeFaction(extra, "f1", { isGM: false })!, "Участники")).toBe("Боб");
    expect(value(describeFaction(extra, "f1", { isGM: true })!, "Участники")).toBe("Алиса: Капитан | Боб");
  });

  it("фракция без описания и участников — пустое состояние", () => {
    const empty: GraphData = { ...data, factions: [{ id: "f9", name: "Пусто", color: "#123456", description: "" }] };
    expect(describeFaction(empty, "f9", { isGM: true })!.empty).toEqual({ hint: null });
  });
});

describe("previewNode", () => {
  it("имя, роль и основная фракция; без роли и фракции — пусто", () => {
    expect(previewNode(data, "a", { isGM: false })).toEqual({
      title: "Алиса",
      role: "Капитан",
      faction: { label: "Стража", color: "#ff0000" },
    });
    expect(previewNode(data, "c", { isGM: false })).toEqual({ title: "Карл", role: "", faction: null });
    expect(previewNode(data, "nope", { isGM: true })).toBeNull();
  });

  it("скрытый узел у игрока — только «Неизвестный», GM видит всё", () => {
    expect(previewNode(withHidden, "a", { isGM: false })).toEqual({ title: "Неизвестный", role: "", faction: null });
    expect(previewNode(withHidden, "a", { isGM: true })?.title).toBe("Алиса");
  });
});
