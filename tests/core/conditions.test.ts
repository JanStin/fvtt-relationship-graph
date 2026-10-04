import { describe, expect, it } from "vitest";
import { setTranslator } from "../../src/core/i18n";
import { installRuTranslator } from "../setup/i18n";
import {
  allConditions,
  conditionIconClass,
  conditionLabel,
  createCondition,
  ensureConditionDefs,
  isBuiltinCondition,
  removeCondition,
  updateCondition,
} from "../../src/core/conditions";
import type { GraphData, GraphNode } from "../../src/core/model";

function makeNode(id: string, conditions: string[]): GraphNode {
  return {
    id,
    type: "placeholder",
    actorId: null,
    name: id,
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
    conditions,
    hidden: false,
    gmOnly: false,
  };
}

function makeData(): GraphData {
  return {
    nodes: [makeNode("a", ["deceased", "cursed"]), makeNode("b", ["cursed"]), makeNode("c", [])],
    edges: [],
    factions: [],
    relationshipTypes: [],
    conditions: [{ id: "cursed", label: "Проклят", icon: "fa-ghost" }],
  };
}

describe("conditionIconClass", () => {
  it("одиночный класс дополняется fa-solid, набор классов идёт как есть", () => {
    expect(conditionIconClass("fa-skull")).toBe("fa-solid fa-skull");
    expect(conditionIconClass(" fa-regular fa-star ")).toBe("fa-regular fa-star");
  });

  it("пустая иконка — иконка по умолчанию", () => {
    expect(conditionIconClass("  ")).toBe("fa-solid fa-tag");
  });
});

describe("allConditions / isBuiltinCondition", () => {
  it("встроенные идут первыми, затем свои", () => {
    const ids = allConditions(makeData()).map((c) => c.id);
    expect(ids).toEqual(["deceased", "questgiver", "captured", "missing", "cursed"]);
  });

  it("различает встроенные и свои", () => {
    expect(isBuiltinCondition("deceased")).toBe(true);
    expect(isBuiltinCondition("cursed")).toBe(false);
  });
});

describe("ensureConditionDefs", () => {
  it("данные без справочника получают пустой справочник", () => {
    const { conditions: _dropped, ...legacy } = makeData();
    const result = ensureConditionDefs({ ...legacy, nodes: [makeNode("a", ["deceased"])] });
    expect(result.conditions).toEqual([]);
  });

  it("неизвестные состояния узлов попадают в справочник один раз, с иконкой по умолчанию", () => {
    const data = makeData();
    const result = ensureConditionDefs({
      ...data,
      nodes: [makeNode("a", ["ранен", "cursed"]), makeNode("b", ["ранен", "missing"])],
    });
    expect(result.conditions).toEqual([
      { id: "cursed", label: "Проклят", icon: "fa-ghost" },
      { id: "ранен", label: "ранен", icon: "fa-tag" },
    ]);
  });

  it("не мутирует вход", () => {
    const data = makeData();
    ensureConditionDefs({ ...data, nodes: [makeNode("a", ["новое"])] });
    expect(data.conditions).toHaveLength(1);
  });
});

describe("createCondition", () => {
  it("добавляет своё состояние, обрезая пробелы", () => {
    const result = createCondition(makeData(), "c2", { label: " Ранен ", icon: " fa-droplet " });
    expect(result.conditions[1]).toEqual({ id: "c2", label: "Ранен", icon: "fa-droplet" });
  });

  it("пустое название хранится пустым и показывается как «Новое состояние», пустая иконка — по умолчанию", () => {
    const result = createCondition(makeData(), "c2", { label: "", icon: "" });
    expect(result.conditions[1]).toEqual({ id: "c2", label: "", icon: "fa-tag" });
    expect(conditionLabel(result.conditions[1])).toBe("Новое состояние");
  });

  it("встроенные состояния — с переведёнными названиями, свои — как введены", () => {
    expect(allConditions(makeData()).find((c) => c.id === "deceased")?.label).toBe("Мёртв");
    expect(conditionLabel({ id: "c9", label: "Ранен", icon: "" })).toBe("Ранен");
  });

  it("старое «Новое состояние» (до локализации) переводится", () => {
    setTranslator((key) => key, "en");
    try {
      expect(conditionLabel({ id: "c9", label: "Новое состояние", icon: "" })).toBe("RELGRAPH.Condition.DefaultName");
    } finally {
      installRuTranslator();
    }
  });

  it("бросает на занятом id — своём или встроенном", () => {
    expect(() => createCondition(makeData(), "cursed", { label: "x", icon: "" })).toThrow(/already exists/);
    expect(() => createCondition(makeData(), "deceased", { label: "x", icon: "" })).toThrow(/already exists/);
  });
});

describe("updateCondition", () => {
  it("меняет название и иконку; пустое название оставляет прежнее", () => {
    const renamed = updateCondition(makeData(), "cursed", { label: "Порча", icon: "fa-bolt" });
    expect(renamed.conditions[0]).toEqual({ id: "cursed", label: "Порча", icon: "fa-bolt" });

    const kept = updateCondition(makeData(), "cursed", { label: " ", icon: "fa-bolt" });
    expect(kept.conditions[0].label).toBe("Проклят");
  });

  it("встроенное и неизвестное состояние — ошибка", () => {
    expect(() => updateCondition(makeData(), "deceased", { label: "x", icon: "" })).toThrow(/built-in/);
    expect(() => updateCondition(makeData(), "nope", { label: "x", icon: "" })).toThrow(/not found/);
  });
});

describe("removeCondition", () => {
  it("удаляет состояние из справочника и снимает его с узлов", () => {
    const data = makeData();
    const result = removeCondition(data, "cursed");

    expect(result.conditions).toEqual([]);
    expect(result.nodes.map((n) => n.conditions)).toEqual([["deceased"], [], []]);
    expect(result.nodes[2]).toBe(data.nodes[2]); // незатронутый узел не пересоздаётся
    expect(data.conditions).toHaveLength(1);
  });

  it("встроенное и неизвестное состояние — ошибка", () => {
    expect(() => removeCondition(makeData(), "deceased")).toThrow(/built-in/);
    expect(() => removeCondition(makeData(), "nope")).toThrow(/not found/);
  });
});
