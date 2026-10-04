/**
 * Применение значений из форм редактирования (NodePanel/EdgePanel) к GraphData.
 * Чистая логика: нормализация ввода + вызовы graph-state. Формы сами ничего не валидируют.
 */

import { allConditions } from "./conditions";
import { addFaction, updateEdge, updateFaction, updateNode } from "./graph-state";
import { t } from "./i18n";
import { normalizeImageAlign } from "./image-align";
import type { Faction, GraphData, GraphEdge, GraphNode, ImageAlign, ImageFit, ImageSource, NodeType } from "./model";
import { normalizeImageFit, normalizeImageSource } from "./node-image";
import { SCALE_MAX, SCALE_MIN } from "./selection";
import { normalizeNodeFlags } from "./visibility";

export interface NodeEditValues {
  /** "actor" без actorId превращается в "placeholder". */
  type: NodeType;
  /** Учитывается только при type === "actor". null — без актёра. */
  actorId: string | null;
  name: string;
  img: string;
  /** Портрет или токен актёра; у узла без актёра хранится, но не используется. */
  imageSource: ImageSource;
  /** Вписывание и выравнивание меняются и у привязанного к актёру узла: картинка от актёра, вид — наш. */
  imageFit: ImageFit;
  imageAlign: ImageAlign;
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
  /** Игрокам виден как «неизвестный»; включает и gmOnly (core/visibility.ts). */
  hidden: boolean;
  /** Узел правит только GM. */
  gmOnly: boolean;
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
 * - Тип и привязка: узел с выбранным актёром — "actor"; без актёра — "placeholder" или "image".
 *   Привязать, сменить и отвязать актёра можно у любого узла.
 * - У узла, привязанного к актёру, name/img не меняются: их при каждом открытии графа
 *   перезаписывает синхронизация с актёром (foundry/actors.ts).
 * - Пустое имя (кроме узла-изображения) и нечисловой scale игнорируются (остаётся прежнее
 *   значение), scale клампится.
 * - Фракции: см. normalizeFactions.
 * - Флаги видимости: hidden включает gmOnly (см. normalizeNodeFlags).
 */
export function applyNodeEdit(data: GraphData, nodeId: string, values: NodeEditValues): GraphData {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) {
    throw new Error(`applyNodeEdit: node "${nodeId}" not found`);
  }

  const actorId = values.type === "actor" ? values.actorId : null;
  const type: NodeType = actorId !== null ? "actor" : values.type === "image" ? "image" : "placeholder";
  const actorBound = actorId !== null;
  const knownConditions = new Set(allConditions(data).map((c) => c.id));
  const name = values.name.trim();
  const scale = Number.isFinite(values.scale) ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, values.scale)) : node.scale;

  return updateNode(data, nodeId, {
    type,
    actorId,
    // «просто изображение» может быть без подписи, остальным узлам имя обязательно
    name: actorBound || (name === "" && type !== "image") ? node.name : name,
    img: actorBound ? node.img : values.img.trim(),
    imageSource: normalizeImageSource(values.imageSource),
    imageFit: normalizeImageFit(values.imageFit),
    imageAlign: normalizeImageAlign(values.imageAlign),
    role: values.role.trim(),
    scale,
    lore: values.lore,
    playerNotes: values.playerNotes,
    gmNotes: values.gmNotes,
    conditions: [...new Set(values.conditions)].filter((id) => knownConditions.has(id)),
    ...normalizeFactions(data, values.factionIds, values.primaryFactionId),
    ...normalizeNodeFlags(values),
  });
}

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

/** Название новой фракции без названия, как оно сохранялось до локализации (1.1.0 и раньше). */
const LEGACY_DEFAULT_FACTION_NAME = "Новая фракция"; // i18n-ignore

/** true — название не задано пользователем: пустое или старое «Новая фракция». */
export function isDefaultFactionName(name: string): boolean {
  return name === "" || name === LEGACY_DEFAULT_FACTION_NAME;
}

/** Название для показа: не заданное пользователем — «Новая фракция» на языке клиента. */
export function factionName(faction: Faction): string {
  return isDefaultFactionName(faction.name) ? t("RELGRAPH.Faction.DefaultName") : faction.name;
}

/**
 * Создаёт фракцию с заданным id (id генерирует вызывающий — core не знает про Foundry).
 * Пустое имя так и хранится — см. factionName.
 */
export function createFactionFromEdit(data: GraphData, factionId: string, values: FactionEditValues): GraphData {
  return addFaction(data, {
    id: factionId,
    name: values.name.trim(),
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

/**
 * Заготовка узла для «Добавить узел»: без актёра, в заданной точке; factionId — область,
 * по которой кликнули (null — пустое место). id генерирует вызывающий. Имя пустое — показывается
 * как «Новый узел» на языке клиента (nodeName).
 */
export function blankNode(id: string, position: { x: number; y: number }, factionId: string | null): GraphNode {
  return {
    id,
    type: "placeholder",
    actorId: null,
    name: "",
    originalName: "",
    img: "",
    x: position.x,
    y: position.y,
    scale: 1.0,
    primaryFactionId: factionId,
    factionIds: factionId === null ? [] : [factionId],
    role: "",
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    hidden: false,
    gmOnly: false,
  };
}

/** Заготовка связи для «Создать связь»: без подписи и типа, ненаправленная. */
export function blankEdge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target, label: "", directional: false, relationshipTypeId: "", gmOnly: false };
}

/** Связь «не заполнена ничем»: без подписи и типа, ненаправленная, не «только GM». */
export function isBlankEdge(edge: GraphEdge): boolean {
  return edge.label.trim() === "" && edge.relationshipTypeId === "" && !edge.directional && !edge.gmOnly;
}
