/**
 * Флаги видимости узла. Чистая логика — без DOM и Foundry.
 * - gmOnly: узел правит только GM, игрокам он виден как обычно.
 * - hidden: игрокам узел виден как «неизвестный» (без имени, картинки и сведений);
 *   всегда подразумевает gmOnly.
 */

import { t } from "./i18n";
import type { GraphData, GraphNode } from "./model";

/** Как скрытый узел называется у игроков там, где нужен текст (карточки, списки, панели). */
export function unknownNodeName(): string {
  return t("RELGRAPH.Node.Unknown");
}

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
 * Приводит флаги всех узлов к инварианту (данные, сохранённые или импортированные до появления флагов).
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

/** Имя нового узла, как оно сохранялось до локализации (1.1.0 и раньше). */
const LEGACY_DEFAULT_NODE_NAME = "Новый узел"; // i18n-ignore

/**
 * true — имя не задано пользователем: старое «Новый узел» или пустое у узла с подписью.
 * У «просто изображения» пустое имя значит «без подписи» — это выбор пользователя.
 */
export function isDefaultNodeName(node: Pick<GraphNode, "name" | "type">): boolean {
  return node.name === LEGACY_DEFAULT_NODE_NAME || (node.name === "" && node.type !== "image");
}

/** Имя узла для показа без учёта видимости: не заданное пользователем — «Новый узел» на языке клиента. */
export function nodeName(node: GraphNode): string {
  return isDefaultNodeName(node) ? t("RELGRAPH.Node.DefaultName") : node.name;
}

/** Имя узла для текста (не для подписи на графе — у скрытого узла её нет вовсе). */
export function displayName(node: GraphNode, isGM: boolean): string {
  return isMasked(node, isGM) ? unknownNodeName() : nodeName(node);
}
