/**
 * Ручной порядок справочников (фракции, типы связей, состояния): перестановка элемента на новое
 * место (стрелки ↑/↓ — на шаг, перетаскивание — куда угодно) и сортировка по порядку
 * справочника. Чистая логика, без DOM и Foundry.
 */

/** Шаг стрелки: -1 — вверх, 1 — вниз. */
export type MoveStep = -1 | 1;

/**
 * Копия списка, где элемент id стоит на месте index (остальные сдвигаются). null — двигать
 * некуда: id нет, index вне списка или элемент и так там.
 */
export function moveToIndex<T extends { id: string }>(items: readonly T[], id: string, index: number): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0 || from === index || !Number.isInteger(index) || index < 0 || index >= items.length) return null;
  const moved = items.filter((_, i) => i !== from);
  moved.splice(index, 0, items[from]);
  return moved;
}

/**
 * Перетаскивание: элемент с места from бросили в щель slot (0 — перед первым, length — после
 * последнего). Возвращает его новое место — щели ниже него сдвигаются на одну после изъятия.
 */
export function indexForSlot(from: number, slot: number): number {
  return slot > from ? slot - 1 : slot;
}

/**
 * Список в порядке order: сначала элементы, чьи id есть в order (в его порядке), затем
 * остальные в исходном порядке. Id из order, которых нет в списке, пропускаются.
 */
export function sortByOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | null | undefined): T[] {
  if (!order || order.length === 0) return [...items];
  const rank = new Map<string, number>();
  order.forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  const ranked = items.filter((item) => rank.has(item.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...ranked, ...items.filter((item) => !rank.has(item.id))];
}

/**
 * id в порядке справочника catalog (для чипов в сведениях). Id, которых в справочнике нет,
 * идут последними в исходном порядке.
 */
export function idsInCatalogOrder(ids: readonly string[], catalog: ReadonlyArray<{ id: string }>): string[] {
  return sortByOrder(
    ids.map((id) => ({ id })),
    catalog.map((item) => item.id),
  ).map((item) => item.id);
}
