import { afterEach, describe, expect, it } from "vitest";
import { loadGraphData, saveGraphData } from "../../src/foundry/storage";
import type { GraphData } from "../../src/core/model";
import { createMockJournalEntry, installMockFoundry } from "../mocks/foundry";

const SAMPLE: GraphData = {
  nodes: [
    {
      id: "n1",
      type: "actor",
      actorId: "a1",
      name: "Тест",
      originalName: "Тест",
      img: "",
      x: 0,
      y: 0,
      scale: 1,
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
  ],
  edges: [],
  factions: [],
  relationshipTypes: [],
  conditions: [],
};

let mock: ReturnType<typeof installMockFoundry> | undefined;

afterEach(() => {
  mock?.restore();
  mock = undefined;
});

describe("loadGraphData", () => {
  it("возвращает null, если JournalEntry ещё не создан", async () => {
    mock = installMockFoundry();
    expect(await loadGraphData()).toBeNull();
  });

  it("возвращает null, если JournalEntry есть, но flag не выставлен", async () => {
    const entry = createMockJournalEntry("Relationship Graph Data");
    mock = installMockFoundry({ journalEntries: [entry] });
    expect(await loadGraphData()).toBeNull();
  });
});

describe("saveGraphData + loadGraphData", () => {
  it("saveGraphData создаёт JournalEntry при первом сохранении", async () => {
    mock = installMockFoundry();
    expect(mock.journalEntries).toHaveLength(0);

    await saveGraphData(SAMPLE);

    expect(mock.journalEntries).toHaveLength(1);
    expect(mock.journalEntries[0].name).toBe("Relationship Graph Data");
  });

  it("сохранённые данные читаются обратно как есть", async () => {
    mock = installMockFoundry();
    await saveGraphData(SAMPLE);

    const loaded = await loadGraphData();
    expect(loaded).toEqual(SAMPLE);
  });

  it("повторное сохранение переиспользует существующий JournalEntry, не создаёт дубликат", async () => {
    mock = installMockFoundry();
    await saveGraphData(SAMPLE);
    await saveGraphData({ ...SAMPLE, edges: [] });

    expect(mock.journalEntries).toHaveLength(1);
  });
});

describe("миграция сохранённых данных", () => {
  it("граф без справочника состояний получает его при загрузке", async () => {
    const { conditions: _dropped, ...legacy } = SAMPLE;
    const legacyData = { ...legacy, nodes: [{ ...SAMPLE.nodes[0], conditions: ["deceased", "ранен"] }] };
    const entry = createMockJournalEntry("Relationship Graph Data");
    await entry.setFlag("fvtt-relationship-graph", "graphData", legacyData);
    mock = installMockFoundry({ journalEntries: [entry] });

    const loaded = await loadGraphData();

    expect(loaded?.conditions).toEqual([{ id: "ранен", label: "ранен", icon: "fa-tag" }]);
    expect(loaded?.nodes[0].conditions).toEqual(["deceased", "ранен"]);
  });
});
