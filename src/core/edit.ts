/**
 * Применение значений из форм редактирования (NodePanel/EdgePanel) к GraphData.
 * Чистая логика: нормализация ввода + вызовы graph-state. Формы сами ничего не валидируют.
 */

import { moveFaction, updateEdge, updateNode } from "./graph-state";
import type { GraphData } from "./model";
import { SCALE_MAX, SCALE_MIN } from "./selection";

export interface NodeEditValues {
  name: string;
  img: string;
  role: string;
  /** null — без фракции. */
  primaryFactionId: string | null;
  scale: number;
  lore: string;
  playerNotes: string;
  gmNotes: string;
  conditions: string[];
}

export interface EdgeEditValues {
  label: string;
  /** '' — тип не задан. */
  relationshipTypeId: string;
  directional: boolean;
  gmOnly: boolean;
}

/** "ранен,  отравлен, ," → ["ранен", "отравлен"]. */
export function parseConditions(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * - У узла, привязанного к актёру, name/img не меняются: их при каждом открытии графа
 *   перезаписывает синхронизация с актёром (foundry/actors.ts).
 * - Пустое имя и нечисловой scale игнорируются (остаётся прежнее значение), scale клампится.
 * - Фракция меняется через moveFaction, и только если реально изменилась — иначе
 *   выбор "без фракции" у узла без primary стирал бы его вторичные фракции.
 */
export function applyNodeEdit(data: GraphData, nodeId: string, values: NodeEditValues): GraphData {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`applyNodeEdit: node "${nodeId}" not found`);
  }

  const actorBound = node.actorId !== null;
  const name = values.name.trim();
  const scale = Number.isFinite(values.scale) ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, values.scale)) : node.scale;

  let result = updateNode(data, nodeId, {
    name: actorBound || name === "" ? node.name : name,
    img: actorBound ? node.img : values.img.trim(),
    role: values.role.trim(),
    scale,
    lore: values.lore,
    playerNotes: values.playerNotes,
    gmNotes: values.gmNotes,
    conditions: values.conditions,
  });

  if (values.primaryFactionId !== node.primaryFactionId) {
    result = moveFaction(result, nodeId, values.primaryFactionId);
  }
  return result;
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
