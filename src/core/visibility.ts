/**
 * Флаги видимости узла (tasks.md, B13). Чистая логика — без DOM и Foundry.
 * - gmOnly: узел правит только GM, игрокам он виден как обычно.
 * - hidden: игрокам узел виден как «неизвестный» (без имени, картинки и сведений);
 *   всегда подразумевает gmOnly.
 */

import type { GraphData, GraphNode } from "./model";

/** Как скрытый узел называется у игроков там, где нужен текст (карточки, списки, панели). */
export const UNKNOWN_NODE_NAME = "Неизвестный";

export interface NodeFlags {
  hidden: boolean;
  gmOnly: boolean;
}

/** hidden всегда подразумевает gmOnly. */
export function normalizeNodeFlags(flags: NodeFlags): NodeFlags {
  const hidden = flags.hidden === true;
  return { hidden, gmOnly: hidden || flags.gmOnly === true };
}

/**
 * Приводит флаги всех узлов к инварианту (данные, сохранённые или импортированные до B13).
 * Если править нечего — возвращает тот же объект.
 */
export function ensureNodeFlags(data: GraphData): GraphData {
  let changed = false;
  const nodes = data.nodes.map((node) => {
    const flags = normalizeNodeFlags(node);
    if (flags.hidden === node.hidden && flags.gmOnly === node.gmOnly) return node;
    changed = true;
    return { ...node, ...flags };
  });
  return changed ? { ...data, nodes } : data;
}

/** true — этому зрителю узел показывается как «неизвестный». */
export function isMasked(node: GraphNode, isGM: boolean): boolean {
  return node.hidden && !isGM;
}

/** Имя узла для текста (не для подписи на графе — у скрытого узла её нет вовсе). */
export function displayName(node: GraphNode, isGM: boolean): string {
  return isMasked(node, isGM) ? UNKNOWN_NODE_NAME : node.name;
}
