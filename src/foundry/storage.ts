/**
 * Хранение GraphData в JournalEntry (см. docs/architecture.md TL;DR: "без лимита размера").
 * Данные лежат во flag на выделенном JournalEntry, а не в тексте страницы — не нужно
 * возиться с HTML-контентом Journal Page, просто произвольный JSON-совместимый объект.
 */

import type { GraphData } from "../core/model";

declare const game: {
  journal: { getName(name: string): MockableJournalEntry | null };
};
declare const JournalEntry: { create(data: { name: string; pages?: unknown[] }): Promise<MockableJournalEntry> };

interface MockableJournalEntry {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
}

const JOURNAL_NAME = "Relationship Graph Data";
const FLAG_SCOPE = "fvtt-relationship-graph";
const FLAG_KEY = "graphData";

async function getOrCreateStorageEntry(): Promise<MockableJournalEntry> {
  const existing = game.journal.getName(JOURNAL_NAME);
  if (existing) return existing;
  return JournalEntry.create({ name: JOURNAL_NAME, pages: [] });
}

/** null, если граф ещё ни разу не сохранялся (JournalEntry не создан или flag пуст). */
export async function loadGraphData(): Promise<GraphData | null> {
  const entry = game.journal.getName(JOURNAL_NAME);
  if (!entry) return null;
  const data = entry.getFlag(FLAG_SCOPE, FLAG_KEY);
  return (data as GraphData | undefined) ?? null;
}

export async function saveGraphData(data: GraphData): Promise<void> {
  const entry = await getOrCreateStorageEntry();
  await entry.setFlag(FLAG_SCOPE, FLAG_KEY, data);
}
