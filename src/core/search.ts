/**
 * Поиск по графу: одно поле ищет сразу по узлам и связям. Чистая логика — без DOM и Foundry.
 * Узлы — по имени и роли, связи — по подписи; вхождение подстроки без учёта регистра, «ё» = «е».
 */

import type { GraphData } from "./model";
import { displayName, isMasked } from "./visibility";

export interface SearchResult {
  /** id совпавших узлов в порядке данных. */
  nodeIds: string[];
  /** id совпавших связей в порядке данных. */
  edgeIds: string[];
}

/** Приводит текст к виду для сравнения: нижний регистр, «ё» → «е». */
export function normalizeSearchText(text: string): string {
  return text.toLocaleLowerCase().replace(/ё/g, "е"); // i18n-ignore
}

/** Пустой запрос (после обрезки пробелов) — ничего не ищем. */
export function isEmptyQuery(query: string): boolean {
  return query.trim() === "";
}

/**
 * Ищет узлы и связи, видимые этому зрителю.
 * У игрока скрытый узел ищется только по имени «неизвестного», роль не ищется;
 * связи gmOnly игроку не ищутся.
 */
export function searchGraph(data: GraphData, query: string, isGM: boolean): SearchResult {
  const needle = normalizeSearchText(query.trim());
  if (needle === "") return { nodeIds: [], edgeIds: [] };
  const matches = (text: string): boolean => normalizeSearchText(text).includes(needle);

  const nodeIds = data.nodes
    .filter((node) => matches(displayName(node, isGM)) || (!isMasked(node, isGM) && matches(node.role)))
    .map((node) => node.id);
  const edgeIds = data.edges
    .filter((edge) => (isGM || !edge.gmOnly) && matches(edge.label))
    .map((edge) => edge.id);
  return { nodeIds, edgeIds };
}
