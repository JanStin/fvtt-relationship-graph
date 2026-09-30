/**
 * Что может игрок (tasks.md, B14). Чистая логика — без DOM и Foundry; GM может всё.
 *
 * Игрок с обычными узлами и связями может то же, что GM: двигать, менять размер, создавать,
 * править, удалять. Исключения:
 * - gmOnly-узлы (значит и все hidden) он не правит, не удаляет, не двигает и не ресайзит;
 * - в узле только GM меняет флаги видимости, заметки GM и привязку к актёру;
 * - у связи только GM ставит «Видна только GM» (такие связи игрок и не видит);
 * - справочники: у фракции игрок правит только описание; создание, удаление и остальные
 *   поля фракций, типов связей и состояний — только GM.
 */

import type { FactionEditValues, NodeEditValues } from "./edit";
import type { Faction, GraphData, GraphNode } from "./model";

/** Узел можно править, удалять, двигать и ресайзить. */
export function canEditNode(node: GraphNode, isGM: boolean): boolean {
  return isGM || !node.gmOnly;
}

/**
 * Значения формы узла с учётом прав: у игрока поля, которые правит только GM, берутся из
 * узла как есть — что бы ни пришло из формы.
 * Привязка к актёру: игрок не может ни привязать, ни сменить, ни отвязать актёра; у свободного
 * узла выбирает только между «без актёра» и «просто изображение».
 */
export function restrictNodeEdit(node: GraphNode, values: NodeEditValues, isGM: boolean): NodeEditValues {
  if (isGM) return values;
  const binding =
    node.type === "actor"
      ? { type: node.type, actorId: node.actorId }
      : { type: values.type === "actor" ? node.type : values.type, actorId: null };
  return { ...values, ...binding, gmNotes: node.gmNotes, hidden: node.hidden, gmOnly: node.gmOnly };
}

/** У игрока из формы фракции берётся только описание. */
export function restrictFactionEdit(faction: Faction, values: FactionEditValues, isGM: boolean): FactionEditValues {
  return isGM ? values : { ...values, name: faction.name, color: faction.color };
}

/**
 * Сколько связей удалится вместе с узлом — из тех, что видит пользователь (для текста
 * подтверждения). Невидимые игроку gmOnly-связи удаляются тоже, но в счёт не входят.
 */
export function visibleEdgeCount(data: GraphData, nodeId: string, isGM: boolean): number {
  return data.edges.filter((e) => (e.source === nodeId || e.target === nodeId) && (isGM || !e.gmOnly)).length;
}
