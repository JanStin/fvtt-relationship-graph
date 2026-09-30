/**
 * Что рисуется поверх/под узлом: имя, роль, ромбики дополнительных фракций, иконки состояний.
 * Чистая логика поверх GraphData — без DOM; в HTML это превращает ui/node-decor.ts.
 */

import type { GraphData, GraphNode } from "./model";

/** Не больше стольких значков в углу; если их больше — на месте последнего «плюс». */
export const MAX_BADGES = 3;

/** Иконки Font Awesome (есть в Foundry) для состояний, встречающихся в экспорте FANG. */
const CONDITION_ICONS: Record<string, string> = {
  deceased: "fa-skull",
  questgiver: "fa-circle-exclamation",
  captured: "fa-link",
  missing: "fa-circle-question",
};
const DEFAULT_CONDITION_ICON = "fa-tag";

export interface BadgeList<T> {
  shown: T[];
  /** true — значков было больше max, после shown рисуется «плюс». */
  more: boolean;
}

export interface ConditionBadge {
  id: string;
  /** CSS-класс иконки Font Awesome. */
  icon: string;
}

export interface NodeDecor {
  name: string;
  /** Пустая строка — строки роли нет. */
  role: string;
  /** Цвета дополнительных (не основной) фракций. */
  factions: BadgeList<string>;
  conditions: BadgeList<ConditionBadge>;
}

/** До max значков как есть; если больше — первые max-1 и флаг more. */
export function limitBadges<T>(items: T[], max = MAX_BADGES): BadgeList<T> {
  return items.length > max ? { shown: items.slice(0, max - 1), more: true } : { shown: [...items], more: false };
}

export function conditionIcon(condition: string): string {
  return CONDITION_ICONS[condition] ?? DEFAULT_CONDITION_ICON;
}

/** Основная фракция ромбиком не помечается — она показана областью. Неизвестные фракции пропускаются. */
export function buildNodeDecor(data: GraphData, node: GraphNode): NodeDecor {
  const colorById = new Map(data.factions.map((f) => [f.id, f.color]));
  const extraColors = node.factionIds
    .filter((id) => id !== node.primaryFactionId)
    .map((id) => colorById.get(id))
    .filter((color): color is string => color !== undefined);

  return {
    name: node.name,
    role: node.role.trim(),
    factions: limitBadges(extraColors),
    conditions: limitBadges(node.conditions.map((id) => ({ id, icon: conditionIcon(id) }))),
  };
}
