import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GraphData, GraphNode } from "../../src/core/model";
import { parseFangJson } from "../../src/import/fang";
import {
  exportFileName,
  exportGraphFile,
  GRAPH_FILE_FORMAT,
  GRAPH_FILE_VERSION,
  parseGraphFile,
  parseGraphFileJson,
} from "../../src/import/native";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "placeholder",
    actorId: null,
    name: overrides.id,
    originalName: overrides.id,
    img: "",
    imageAlign: "center",
    x: 10,
    y: 20,
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

const graph: GraphData = {
  nodes: [
    makeNode({
      id: "a",
      type: "actor",
      actorId: "act1",
      name: "Алиса",
      img: "a.png",
      scale: 2.5,
      primaryFactionId: "f2",
      factionIds: ["f2", "f1"],
      role: "Капитан",
      lore: "история",
      playerNotes: "заметки",
      gmNotes: "секрет",
      conditions: ["deceased", "cursed"],
    }),
    makeNode({ id: "b", hidden: true, gmOnly: true, type: "image", name: "" }),
  ],
  edges: [
    { id: "e1", source: "a", target: "b", label: "знает", directional: true, relationshipTypeId: "romantic", gmOnly: true },
  ],
  factions: [
    { id: "f1", name: "Стража", color: "#ff0000", description: "город" },
    { id: "f2", name: "Воры", color: "#00ff00", description: "" },
  ],
  relationshipTypes: [{ id: "romantic", label: "Романтическая", color: "#ec4899", dash: "4,4" }],
  conditions: [{ id: "cursed", label: "Проклят", icon: "fa-ghost" }],
};

/** Экспорт → JSON-строка → разбор, как с настоящим файлом. */
function roundTrip(data: GraphData): unknown {
  return JSON.parse(JSON.stringify(exportGraphFile(data, new Date("2026-09-30T12:00:00Z"))));
}

describe("экспорт", () => {
  it("кладёт маркер формата, версию, дату и данные", () => {
    const file = exportGraphFile(graph, new Date("2026-09-30T12:00:00Z"));
    expect(file).toEqual({
      format: GRAPH_FILE_FORMAT,
      version: GRAPH_FILE_VERSION,
      exportedAt: "2026-09-30T12:00:00.000Z",
      data: graph,
    });
  });

  it("имя файла с датой", () => {
    expect(exportFileName(new Date("2026-09-30T12:00:00Z"))).toBe("relationship-graph-2026-09-30.json");
  });
});

describe("экспорт → импорт", () => {
  it("даёт тот же граф без предупреждений", () => {
    const { data, warnings } = parseGraphFileJson(roundTrip(graph));
    expect(data).toEqual(graph);
    expect(warnings).toEqual([]);
  });

  it("сохраняет фон графа", () => {
    const withBackground: GraphData = {
      ...graph,
      background: {
        color: "#202020",
        image: "maps/city.webp",
        imageMode: "tile",
        imageX: -100,
        imageY: 50,
        imageWidth: 256,
        imageOpacity: 0.5,
        font: "Tahoma",
      },
    };
    expect(parseGraphFileJson(roundTrip(withBackground)).data).toEqual(withBackground);
  });

  it("сброшенный фон (null) остаётся стандартным", () => {
    expect(parseGraphFileJson(roundTrip({ ...graph, background: null })).data.background ?? null).toBeNull();
  });

  it("parseGraphFile распознаёт свой формат", () => {
    const result = parseGraphFile(roundTrip(graph));
    expect(result.format).toBe("native");
    expect(result.data).toEqual(graph);
  });

  it("parseGraphFile отдаёт остальное парсеру FANG", () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, "../fixtures/fang.json"), "utf-8"));
    const result = parseGraphFile(raw);
    expect(result.format).toBe("fang");
    expect(result.data).toEqual(parseFangJson(raw).data);
  });
});

describe("импорт своего формата: нормализация и битые данные", () => {
  function file(data: unknown, version: unknown = 1): unknown {
    return { format: GRAPH_FILE_FORMAT, version, exportedAt: "", data };
  }

  it("битые ссылки, повторы и неизвестные значения чинятся с предупреждениями", () => {
    const { data, warnings } = parseGraphFileJson(
      file({
        nodes: [
          { id: "a", type: "weird", scale: 99, factionIds: ["ghost"], primaryFactionId: "ghost", conditions: ["новое"], hidden: true },
          { id: "a" },
          { name: "без id" },
        ],
        edges: [
          { id: "e1", source: "a", target: "missing" },
          { id: "e2", source: "a", target: "a", relationshipTypeId: "unknown" },
        ],
      }),
    );

    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0]).toMatchObject({
      type: "placeholder",
      scale: 5,
      factionIds: [],
      primaryFactionId: null,
      hidden: true,
      gmOnly: true, // hidden ⇒ gmOnly
    });
    expect(data.edges.map((e) => e.id)).toEqual(["e2"]);
    expect(data.edges[0].relationshipTypeId).toBe("");
    // неизвестное состояние — в справочник, тип «Романтическая» — по умолчанию
    expect(data.conditions.map((c) => c.id)).toEqual(["новое"]);
    expect(data.relationshipTypes.map((rt) => rt.id)).toEqual(["romantic"]);
    expect(warnings.length).toBeGreaterThanOrEqual(4);
  });

  it("выравнивание изображения: известное читается, нет или неизвестное — по центру", () => {
    const { data } = parseGraphFileJson(
      file({ nodes: [{ id: "a", imageAlign: "bottom-left" }, { id: "b" }, { id: "c", imageAlign: "diagonal" }] }),
    );
    expect(data.nodes.map((n) => n.imageAlign)).toEqual(["bottom-left", "center", "center"]);
  });

  it("актёр без actorId становится узлом без актёра", () => {
    const { data } = parseGraphFileJson(file({ nodes: [{ id: "a", type: "actor" }] }));
    expect(data.nodes[0]).toMatchObject({ type: "placeholder", actorId: null });
  });

  it("встроенные состояния в справочнике файла игнорируются", () => {
    const { data } = parseGraphFileJson(
      file({ nodes: [], conditions: [{ id: "deceased", label: "Подделка", icon: "fa-x" }] }),
    );
    expect(data.conditions).toEqual([]);
  });

  it("понятные ошибки: не файл графа, нет версии, версия новее, нет узлов", () => {
    expect(() => parseGraphFileJson({ nodes: [] })).toThrow(/не файл графа/);
    expect(() => parseGraphFileJson(file({ nodes: [] }, null))).toThrow(/версия/);
    expect(() => parseGraphFileJson(file({ nodes: [] }, GRAPH_FILE_VERSION + 1))).toThrow(/обновите модуль/);
    expect(() => parseGraphFileJson(file({}))).toThrow(/data\.nodes/);
  });

  it("чужой файл без nodes — ошибка парсера FANG", () => {
    expect(() => parseGraphFile({ hello: "world" })).toThrow(/nodes/);
  });
});

describe("импорт своего формата: фон", () => {
  const file = (background: unknown) => ({ format: GRAPH_FILE_FORMAT, version: 1, exportedAt: "", data: { nodes: [], background } });

  it("неизвестный режим и неверные числа заменяются значениями по умолчанию", () => {
    const { data } = parseGraphFileJson(
      file({ color: "#111111", image: "a.png", imageMode: "weird", imageX: "x", imageWidth: -5, imageOpacity: 7 }),
    );
    expect(data.background).toEqual({
      color: "#111111",
      image: "a.png",
      imageMode: "single",
      imageX: 0,
      imageY: 0,
      imageWidth: 0,
      imageOpacity: 1,
      font: "",
    });
  });

  it("режим «на весь экран» читается", () => {
    const { data } = parseGraphFileJson(file({ image: "bg.webp", imageMode: "screen" }));
    expect(data.background?.imageMode).toBe("screen");
  });

  it("фон без цвета и картинки — стандартный", () => {
    expect(parseGraphFileJson(file({ imageMode: "tile" })).data.background).toBeNull();
  });
});
