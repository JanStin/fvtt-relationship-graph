import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FANG_PLACEHOLDER_IMG, parseFangJson } from "../../src/import/fang";
import fixture from "../fixtures/fang.json";

describe("parseFangJson", () => {
  it("парсит фикстуру без исключений и с ожидаемыми размерами", () => {
    const { data, warnings } = parseFangJson(fixture);

    expect(data.nodes).toHaveLength(5);
    expect(data.factions).toHaveLength(2);
    expect(data.relationshipTypes).toHaveLength(2);
    // один из двух links битый (source/target не существует) -> отброшен
    expect(data.edges).toHaveLength(1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("маппит обычный actor-узел", () => {
    const { data } = parseFangJson(fixture);
    const node = data.nodes.find((n) => n.id === "m7jLJG6ULwiqR6m8");

    expect(node).toMatchObject({
      type: "actor",
      actorId: "m7jLJG6ULwiqR6m8",
      name: "Артадель",
      scale: 1.0,
      primaryFactionId: "8WANCvHmci3zgz7T",
      factionIds: ["8WANCvHmci3zgz7T"],
    });
  });

  it("маппит чистый placeholder", () => {
    const { data } = parseFangJson(fixture);
    const node = data.nodes.find((n) => n.id === "ph-C5WfkyMhliGgH5SH");

    expect(node).toMatchObject({
      type: "placeholder",
      actorId: null,
      name: "Кора",
      role: "Жрица",
    });
  });

  it("заглушка FANG превращается в пустой img", () => {
    const { data } = parseFangJson(fixture);

    expect(data.nodes.find((n) => n.id === "ph-C5WfkyMhliGgH5SH")?.img).toBe("");
    expect(data.nodes.find((n) => n.id === "ph-zqpkezu60rcZHESP")?.img).toBe("");
  });

  it("обычный путь к изображению не трогается", () => {
    const { data } = parseFangJson(fixture);

    expect(data.nodes.find((n) => n.id === "m7jLJG6ULwiqR6m8")?.img).toBe("tokenizer/pc-images/artadel_.Token.webp");
    // похожий, но не совпадающий с заглушкой путь — тоже как есть
    const custom = parseFangJson({ nodes: [{ id: "n1", img: "worlds/my/placeholder-npc.svg" }] });
    expect(custom.data.nodes[0].img).toBe("worlds/my/placeholder-npc.svg");
  });

  it("в реальном fang.json не остаётся ни одной заглушки FANG", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../../fang.json"), "utf-8"));
    const { data } = parseFangJson(raw);

    expect(data.nodes.some((n) => n.img === FANG_PLACEHOLDER_IMG)).toBe(false);
    expect(data.nodes.filter((n) => n.img === "")).toHaveLength(33);
  });

  it("маппит псевдо-placeholder (id начинается с ph-, но isPlaceholder: false) как actor", () => {
    const { data } = parseFangJson(fixture);
    const node = data.nodes.find((n) => n.id === "ph-cJE1vbnje3TjgBhO");

    expect(node).toMatchObject({
      type: "actor",
      actorId: "RFAt0Lri14I8tRTR",
    });
  });

  it("узел без фракции получает primaryFactionId null и пустой factionIds", () => {
    const { data } = parseFangJson(fixture);
    const node = data.nodes.find((n) => n.id === "pK3djdXmiPNM8N6s");

    expect(node).toMatchObject({
      primaryFactionId: null,
      factionIds: [],
    });
  });

  it("ссылка на несуществующую фракцию отбрасывается с предупреждением", () => {
    const { data, warnings } = parseFangJson(fixture);
    const node = data.nodes.find((n) => n.id === "ph-zqpkezu60rcZHESP");

    expect(node).toMatchObject({
      primaryFactionId: null,
      factionIds: [],
    });
    expect(warnings.some((w) => w.includes("ghost-faction") || w.includes("фракци"))).toBe(true);
  });

  it("валидная связь маппится: id генерируется, relationshipType -> relationshipTypeId", () => {
    const { data } = parseFangJson(fixture);

    expect(data.edges).toEqual([
      {
        id: "m7jLJG6ULwiqR6m8-ph-C5WfkyMhliGgH5SH-0",
        source: "m7jLJG6ULwiqR6m8",
        target: "ph-C5WfkyMhliGgH5SH",
        label: "знакомы",
        directional: false,
        relationshipTypeId: "ally",
        gmOnly: false,
      },
    ]);
  });

  it("связь с битой ссылкой (target не существует) отбрасывается с предупреждением", () => {
    const { data, warnings } = parseFangJson(fixture);

    expect(data.edges.find((e) => e.source === "ph-cJE1vbnje3TjgBhO")).toBeUndefined();
    expect(warnings.some((w) => w.includes("does-not-exist"))).toBe(true);
  });

  it("фракции: playerVisible из FANG не переносится", () => {
    const { data } = parseFangJson(fixture);
    const faction = data.factions.find((f) => f.id === "8WANCvHmci3zgz7T");

    expect(faction).toEqual({
      id: "8WANCvHmci3zgz7T",
      name: "Зентарим",
      color: "#000000",
      description: "Черная Сеть",
    });
  });

  it("relationshipTypes переносятся как есть", () => {
    const { data } = parseFangJson(fixture);

    expect(data.relationshipTypes).toEqual([
      { id: "ally", label: "Союзник", color: "#2f9e44", dash: "" },
      { id: "enemy", label: "Враг", color: "#b91c1c", dash: "" },
    ]);
  });

  it("неизвестные состояния узлов попадают в справочник, встроенные — нет", () => {
    const { data } = parseFangJson({
      nodes: [
        { id: "n1", conditions: ["deceased", "ранен"] },
        { id: "n2", conditions: ["ранен"] },
      ],
    });

    expect(data.conditions).toEqual([{ id: "ранен", label: "ранен", icon: "fa-tag" }]);
    expect(data.nodes[0].conditions).toEqual(["deceased", "ранен"]);
  });

  it("отсутствующие поля не ломают парсер — используются дефолты", () => {
    const raw = {
      nodes: [{ id: "n1" }],
      links: [],
      factions: [],
      relationshipTypes: [],
    };

    const { data } = parseFangJson(raw);

    expect(data.nodes).toEqual([
      {
        id: "n1",
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
      },
    ]);
  });

  it("узел без id пропускается с предупреждением, не роняет парсер", () => {
    const raw = {
      nodes: [{ name: "без id" }, { id: "n1", name: "с id" }],
      links: [],
      factions: [],
      relationshipTypes: [],
    };

    const { data, warnings } = parseFangJson(raw);

    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0].id).toBe("n1");
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("бросает ошибку, если верхний уровень не объект", () => {
    expect(() => parseFangJson(null)).toThrow();
    expect(() => parseFangJson([])).toThrow();
    expect(() => parseFangJson("not json")).toThrow();
  });

  it("бросает ошибку, если nodes отсутствует или не массив", () => {
    expect(() => parseFangJson({})).toThrow();
    expect(() => parseFangJson({ nodes: "oops" })).toThrow();
  });

  it("парсит реальный fang.json из корня проекта без исключений", () => {
    const realFixturePath = resolve(__dirname, "../../fang.json");
    const raw = JSON.parse(readFileSync(realFixturePath, "utf-8"));

    const { data, warnings } = parseFangJson(raw);

    expect(data.nodes.length).toBe(raw.nodes.length);
    expect(data.edges.length).toBeGreaterThan(0);
    expect(data.edges.length).toBeLessThanOrEqual(raw.links.length);
    expect(data.factions.length).toBe(raw.factions.length);
    expect(Array.isArray(warnings)).toBe(true);
  });
});
