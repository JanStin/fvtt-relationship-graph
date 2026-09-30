/**
 * Справочник типов связей (GraphData.relationshipTypes): создание, правка, удаление и
 * разбор стиля линии. Чистая логика, как core/conditions.ts.
 */

import type { GraphData, RelationshipType } from "./model";

export interface RelationshipTypeEditValues {
  label: string;
  color: string;
  /** '' — сплошная линия, иначе длины штриха и пробела через запятую ("8,5"). */
  dash: string;
}

/** Готовые стили линии для формы типа связи. */
export const DASH_PRESETS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Сплошная" },
  { value: "8,5", label: "Пунктир" },
  { value: "14,6", label: "Длинный пунктир" },
  { value: "2,4", label: "Точки" },
];

/** Типы, которые есть в любом графе: добавляются при импорте и при загрузке, если их нет. */
export const DEFAULT_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  { id: "romantic", label: "Романтическая", color: "#ec4899", dash: "" },
];

/**
 * Дописывает недостающие типы по умолчанию (сверка по id), существующие не трогает.
 * Вызывается при каждой загрузке — поэтому удалённый тип по умолчанию вернётся при следующем
 * открытии графа; переименовать и перекрасить его можно.
 */
export function ensureDefaultRelationshipTypes(data: GraphData): GraphData {
  const existing = new Set(data.relationshipTypes.map((rt) => rt.id));
  const missing = DEFAULT_RELATIONSHIP_TYPES.filter((rt) => !existing.has(rt.id));
  return missing.length === 0 ? data : { ...data, relationshipTypes: [...data.relationshipTypes, ...missing] };
}

const DEFAULT_LABEL = "Новый тип связи";
const DEFAULT_COLOR = "#888888";

/**
 * "8,5" → [8, 5]. null — сплошная линия: пустая строка или мусор (меньше двух чисел,
 * не число, не положительное).
 */
export function parseDash(dash: string): number[] | null {
  const parts = dash
    .split(/[\s,]+/)
    .filter((part) => part !== "")
    .map(Number);
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return parts;
}

/** Мусор в стиле линии превращается в '' (сплошная), валидный — в каноничный вид "8,5". */
function normalizeDash(dash: string): string {
  return parseDash(dash)?.join(",") ?? "";
}

/** id генерирует вызывающий (core не знает про Foundry). */
export function createRelationshipType(
  data: GraphData,
  typeId: string,
  values: RelationshipTypeEditValues,
): GraphData {
  if (typeId === "" || data.relationshipTypes.some((rt) => rt.id === typeId)) {
    throw new Error(`createRelationshipType: invalid or duplicate id "${typeId}"`);
  }
  const type: RelationshipType = {
    id: typeId,
    label: values.label.trim() || DEFAULT_LABEL,
    color: values.color.trim() || DEFAULT_COLOR,
    dash: normalizeDash(values.dash),
  };
  return { ...data, relationshipTypes: [...data.relationshipTypes, type] };
}

/** Пустое название и пустой цвет оставляют прежние. */
export function updateRelationshipType(
  data: GraphData,
  typeId: string,
  values: RelationshipTypeEditValues,
): GraphData {
  if (!data.relationshipTypes.some((rt) => rt.id === typeId)) {
    throw new Error(`updateRelationshipType: type "${typeId}" not found`);
  }
  return {
    ...data,
    relationshipTypes: data.relationshipTypes.map((rt) =>
      rt.id === typeId
        ? {
            id: rt.id,
            label: values.label.trim() || rt.label,
            color: values.color.trim() || rt.color,
            dash: normalizeDash(values.dash),
          }
        : rt,
    ),
  };
}

/** Удаляет тип; связи остаются, но без типа (relationshipTypeId: ''). Не найден — тихий no-op. */
export function removeRelationshipType(data: GraphData, typeId: string): GraphData {
  return {
    ...data,
    relationshipTypes: data.relationshipTypes.filter((rt) => rt.id !== typeId),
    edges: data.edges.map((e) => (e.relationshipTypeId === typeId ? { ...e, relationshipTypeId: "" } : e)),
  };
}
