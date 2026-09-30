/**
 * Хранение GraphData в JournalEntry (см. docs/architecture.md TL;DR: "без лимита размера").
 * Данные лежат во flag на выделенном JournalEntry, а не в тексте страницы — не нужно
 * возиться с HTML-контентом Journal Page, просто произвольный JSON-совместимый объект.
 */

import { ensureConditionDefs } from "../core/conditions";
import type { GraphData } from "../core/model";
import { ensureDefaultRelationshipTypes } from "../core/relationship-types";
import { ensureNodeFlags } from "../core/visibility";

declare const game: {
  journal: { getName(name: string): MockableJournalEntry | null };
};
declare const JournalEntry: {
  create(data: { name: string; pages?: unknown[]; ownership?: { default: number } }): Promise<MockableJournalEntry>;
};

interface MockableJournalEntry {
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
  ownership?: { default?: number };
  update?(data: { ownership: { default: number } }): Promise<unknown>;
}

/** CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER — право изменять документ. */
const OWNERSHIP_OWNER = 3;

const JOURNAL_NAME = "Relationship Graph Data";
const FLAG_SCOPE = "fvtt-relationship-graph";
const FLAG_KEY = "graphData";

async function getOrCreateStorageEntry(): Promise<MockableJournalEntry> {
  const existing = game.journal.getName(JOURNAL_NAME);
  if (existing) return existing;
  // Владельцы — все: игроки тоже сохраняют граф (создают и правят связи).
  return JournalEntry.create({ name: JOURNAL_NAME, pages: [], ownership: { default: OWNERSHIP_OWNER } });
}

/**
 * Даёт игрокам право записи в уже существующее хранилище (журнал, созданный до того, как
 * игрокам разрешили править связи). Вызывать от имени GM; если журнала ещё нет — ничего
 * не делает, при первом сохранении он создастся уже с нужными правами.
 */
export async function allowPlayersToSave(): Promise<void> {
  const entry = game.journal.getName(JOURNAL_NAME);
  if (!entry || (entry.ownership?.default ?? 0) >= OWNERSHIP_OWNER) return;
  await entry.update?.({ ownership: { default: OWNERSHIP_OWNER } });
}

/**
 * null, если граф ещё ни разу не сохранялся (JournalEntry не создан или flag пуст).
 * Данные старого формата (без справочника состояний, без типов связей по умолчанию,
 * hidden-узлы без gmOnly) дополняются на лету.
 */
export async function loadGraphData(): Promise<GraphData | null> {
  const entry = game.journal.getName(JOURNAL_NAME);
  if (!entry) return null;
  const data = entry.getFlag(FLAG_SCOPE, FLAG_KEY);
  return data ? ensureNodeFlags(ensureDefaultRelationshipTypes(ensureConditionDefs(data as GraphData))) : null;
}

export async function saveGraphData(data: GraphData): Promise<void> {
  const entry = await getOrCreateStorageEntry();
  await entry.setFlag(FLAG_SCOPE, FLAG_KEY, data);
}
