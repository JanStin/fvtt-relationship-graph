/**
 * Применение значений из форм редактирования (NodePanel/EdgePanel) к GraphData.
 * Чистая логика: нормализация ввода + вызовы graph-state. Формы сами ничего не валидируют.
 */

import { allConditions } from "./conditions";
import { addFaction, updateEdge, updateFaction, updateNode } from "./graph-state";
import type { GraphData } from "./model";
import { SCALE_MAX, SCALE_MIN } from "./selection";

export interface NodeEditValues {
  name: string;
  img: string;
  role: string;
  /** Все отмеченные фракции узла. */
  factionIds: string[];
  /** Основная (область). Если не входит в factionIds — основной станет первая отмеченная. */
  primaryFactionId: string | null;
  scale: number;
  lore: string;
  playerNotes: string;
  gmNotes: string;
  /** id отмеченных состояний; неизвестные справочнику отбрасываются. */
  conditions: string[];
}

export interface FactionEditValues {
  name: string;
  color: string;
  description: string;
}

export interface EdgeEditValues {
  label: string;
  /** '' — тип не задан. */
  relationshipTypeId: string;
  directional: boolean;
  gmOnly: boolean;
}

/**
 * Приводит выбор фракций к инварианту модели: неизвестные и повторные отбрасываются; если
 * отмечена хотя бы одна фракция, основная обязательна (по умолчанию — первая отмеченная) и
 * стоит первой в factionIds.
 */
export function normalizeFactions(
  data: GraphData,
  factionIds: readonly string[],
  primaryFactionId: string | null,
): { factionIds: string[]; primaryFactionId: string | null } {
  const known = new Set(data.factions.map((f) => f.id));
  const ids = [...new Set(factionIds)].filter((id) => known.has(id));
  if (ids.length === 0) return { factionIds: [], primaryFactionId: null };

  const primary = primaryFactionId !== null && ids.includes(primaryFactionId) ? primaryFactionId : ids[0];
  return { factionIds: [primary, ...ids.filter((id) => id !== primary)], primaryFactionId: primary };
}

/**
 * Кому переходит роль основной, когда с основной фракции сняли галочку: следующей отмеченной
 * по порядку списка, а если ниже отмеченных нет — первой отмеченной. null — отмеченных не осталось.
 * order — все фракции в порядке списка, checked — отмеченные ПОСЛЕ снятия галочки.
 */
export function primaryAfterUncheck(
  order: readonly string[],
  checked: ReadonlySet<string>,
  uncheckedId: string,
): string | null {
  const index = order.indexOf(uncheckedId);
  const after = order.slice(index + 1).find((id) => checked.has(id));
  return after ?? order.find((id) => checked.has(id)) ?? null;
}

/**
 * - У узла, привязанного к актёру, name/img не меняются: их при каждом открытии графа
 *   перезаписывает синхронизация с актёром (foundry/actors.ts).
 * - Пустое имя и нечисловой scale игнорируются (остаётся прежнее значение), scale клампится.
 * - Фракции: см. normalizeFactions.
 */
export function applyNodeEdit(data: GraphData, nodeId: string, values: NodeEditValues): GraphData {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`applyNodeEdit: node "${nodeId}" not found`);
  }

  const actorBound = node.actorId !== null;
  const knownConditions = new Set(allConditions(data).map((c) => c.id));
  const name = values.name.trim();
  const scale = Number.isFinite(values.scale) ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, values.scale)) : node.scale;

  return updateNode(data, nodeId, {
    name: actorBound || name === "" ? node.name : name,
    img: actorBound ? node.img : values.img.trim(),
    role: values.role.trim(),
    scale,
    lore: values.lore,
    playerNotes: values.playerNotes,
    gmNotes: values.gmNotes,
    conditions: [...new Set(values.conditions)].filter((id) => knownConditions.has(id)),
    ...normalizeFactions(data, values.factionIds, values.primaryFactionId),
  });
}

const DEFAULT_FACTION_NAME = "Новая фракция";
const DEFAULT_FACTION_COLOR = "#888888";

/** Пустое имя оставляет прежнее, пустой цвет — прежний. */
export function applyFactionEdit(data: GraphData, factionId: string, values: FactionEditValues): GraphData {
  const name = values.name.trim();
  const color = values.color.trim();
  return updateFaction(data, factionId, {
    ...(name === "" ? {} : { name }),
    ...(color === "" ? {} : { color }),
    description: values.description,
  });
}

/** Создаёт фракцию с заданным id (id генерирует вызывающий — core не знает про Foundry). */
export function createFactionFromEdit(data: GraphData, factionId: string, values: FactionEditValues): GraphData {
  return addFaction(data, {
    id: factionId,
    name: values.name.trim() || DEFAULT_FACTION_NAME,
    color: values.color.trim() || DEFAULT_FACTION_COLOR,
    description: values.description,
  });
}

/** Неизвестный тип связи сбрасывается в '' (не задан). */
export function applyEdgeEdit(data: GraphData, edgeId: string, values: EdgeEditValues): GraphData {
  const typeExists = data.relationshipTypes.some((rt) => rt.id === values.relationshipTypeId);
  return updateEdge(data, edgeId, {
    label: values.label.trim(),
    relationshipTypeId: typeExists ? values.relationshipTypeId : "",
    directional: values.directional,
    gmOnly: values.gmOnly,
  });
}
