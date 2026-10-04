import { afterEach, describe, expect, it } from "vitest";
import { allowPlayersToSave, hideStorageEntry, loadGraphData, saveGraphData } from "../../src/foundry/storage";
import type { GraphData } from "../../src/core/model";
import { DEFAULT_RELATIONSHIP_TYPES } from "../../src/core/relationship-types";
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

  it("сохранённые данные читаются обратно; дописываются только стандартные типы связей", async () => {
    mock = installMockFoundry();
    await saveGraphData(SAMPLE);

    const loaded = await loadGraphData();
    expect(loaded).toEqual({
      ...SAMPLE,
      relationshipTypes: DEFAULT_RELATIONSHIP_TYPES,
    });
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

describe("права игроков на хранилище", () => {
  it("новый JournalEntry создаётся с правом записи для всех", async () => {
    mock = installMockFoundry();
    await saveGraphData(SAMPLE);
    expect(mock.journalEntries[0].ownership.default).toBe(3);
  });

  it("allowPlayersToSave поднимает права у старого журнала", async () => {
    const entry = createMockJournalEntry("Relationship Graph Data");
    mock = installMockFoundry({ journalEntries: [entry] });

    await allowPlayersToSave();

    expect(entry.ownership.default).toBe(3);
  });

  it("allowPlayersToSave не создаёт журнал, если его ещё нет", async () => {
    mock = installMockFoundry();
    await allowPlayersToSave();
    expect(mock.journalEntries).toHaveLength(0);
  });
});

describe("hideStorageEntry", () => {
  function directory(...ids: string[]): HTMLElement {
    const root = document.createElement("section");
    root.innerHTML = ids.map((id) => `<li class="directory-item" data-entry-id="${id}"></li>`).join("");
    return root;
  }

  it("убирает из списка только журнал-хранилище", () => {
    const entry = createMockJournalEntry("Relationship Graph Data", "store1");
    mock = installMockFoundry({ journalEntries: [entry, createMockJournalEntry("Заметки", "other")] });
    const html = directory("other", "store1");
    hideStorageEntry(html);
    expect([...html.querySelectorAll("li")].map((li) => li.dataset.entryId)).toEqual(["other"]);
  });

  it("без журнала-хранилища список не трогает", () => {
    mock = installMockFoundry();
    const html = directory("other");
    hideStorageEntry(html);
    expect(html.querySelectorAll("li")).toHaveLength(1);
  });
});
