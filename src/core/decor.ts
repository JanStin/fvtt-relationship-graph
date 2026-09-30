/**
 * Что рисуется поверх/под узлом: имя, роль, ромбики дополнительных фракций, иконки состояний.
 * Чистая логика поверх GraphData — без DOM; в HTML это превращает ui/node-decor.ts.
 */

import { allConditions, conditionIconClass, DEFAULT_CONDITION_ICON } from "./conditions";
import type { GraphData, GraphNode } from "./model";
import { isMasked } from "./visibility";

/** Не больше стольких значков в углу; если их больше — на месте последнего «плюс». */
export const MAX_BADGES = 3;

export interface BadgeList<T> {
  shown: T[];
  /** true — значков было больше max, после shown рисуется «плюс». */
  more: boolean;
}

export interface ConditionBadge {
  id: string;
  /** Готовые CSS-классы иконки Font Awesome для <i>. */
  icon: string;
}

export interface NodeDecor {
  name: string;
  /** Пустая строка — строки роли нет. */
  role: string;
  /** Цвета дополнительных (не основной) фракций. */
  factions: BadgeList<string>;
  conditions: BadgeList<ConditionBadge>;
  /** Градиентная окольцовка скрытого узла: у игрока — «неизвестный», у GM — пометка «скрыт». */
  hidden: boolean;
}

export interface DecorOptions {
  /** Игроку скрытый узел рисуется без имени, роли и значков. */
  isGM: boolean;
}

/** До max значков как есть; если больше — первые max-1 и флаг more. */
export function limitBadges<T>(items: T[], max = MAX_BADGES): BadgeList<T> {
  return items.length > max ? { shown: items.slice(0, max - 1), more: true } : { shown: [...items], more: false };
}

/** Основная фракция ромбиком не помечается — она показана областью. Неизвестные фракции пропускаются. */
export function buildNodeDecor(data: GraphData, node: GraphNode, options: DecorOptions): NodeDecor {
  if (isMasked(node, options.isGM)) {
    return { name: "", role: "", factions: limitBadges([]), conditions: limitBadges([]), hidden: true };
  }

  const colorById = new Map(data.factions.map((f) => [f.id, f.color]));
  const extraColors = node.factionIds
    .filter((id) => id !== node.primaryFactionId)
    .map((id) => colorById.get(id))
    .filter((color): color is string => color !== undefined);

  const iconById = new Map(allConditions(data).map((c) => [c.id, c.icon]));

  return {
    name: node.name,
    role: node.role.trim(),
    factions: limitBadges(extraColors),
    conditions: limitBadges(
      node.conditions.map((id) => ({ id, icon: conditionIconClass(iconById.get(id) ?? DEFAULT_CONDITION_ICON) })),
    ),
    hidden: node.hidden,
  };
}
