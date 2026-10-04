/**
 * Справочник типов связей (GraphData.relationshipTypes): создание, правка, удаление и
 * разбор стиля линии. Чистая логика, как core/conditions.ts.
 */

import { t } from "./i18n";
import type { GraphData, RelationshipType } from "./model";

export interface RelationshipTypeEditValues {
  label: string;
  color: string;
  /** '' — сплошная линия, иначе длины штриха и пробела через запятую ("8,5"). */
  dash: string;
}

/** Готовые стили линии для формы типа связи. */
export function dashPresets(): Array<{ value: string; label: string }> {
  return [
    { value: "", label: t("RELGRAPH.RelationshipType.DashSolid") },
    { value: "8,5", label: t("RELGRAPH.RelationshipType.DashDashed") },
    { value: "14,6", label: t("RELGRAPH.RelationshipType.DashLong") },
    { value: "2,4", label: t("RELGRAPH.RelationshipType.DashDotted") },
  ];
}

/**
 * Стандартные типы — есть в любом графе: добавляются при импорте и при загрузке, если их нет.
 * Часть id совпадает с FANG. Название пустое — показывается перевод по id
 * (RELGRAPH.RelationshipType.Builtin.<id>).
 */
export const DEFAULT_RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  { id: "ally", label: "", color: "#2f9e44", dash: "" },
  { id: "enemy", label: "", color: "#b91c1c", dash: "" },
  { id: "family", label: "", color: "#d97706", dash: "" },
  { id: "hierarchy", label: "", color: "#2563eb", dash: "" },
  { id: "quest", label: "", color: "#9333ea", dash: "" },
  { id: "romantic", label: "", color: "#ec4899", dash: "" },
  { id: "unknown", label: "", color: "#6b7280", dash: "" },
];

/**
 * Названия стандартных типов, с которыми они приходили до локализации (старые графы, импорт из
 * FANG), — считаем непереименованными.
 */
const LEGACY_DEFAULT_LABELS: Record<string, string> = {
  ally: "Союзник", // i18n-ignore
  enemy: "Враг", // i18n-ignore
  family: "Семья", // i18n-ignore
  hierarchy: "Иерархия", // i18n-ignore
  quest: "Задание", // i18n-ignore
  unknown: "Неизвестно", // i18n-ignore
  romantic: "Романтическая", // i18n-ignore
};

/** Название нового типа без названия, как оно сохранялось до локализации (1.1.0 и раньше). */
const LEGACY_NEW_TYPE_LABEL = "Новый тип связи"; // i18n-ignore

function isStandardType(typeId: string): boolean {
  return DEFAULT_RELATIONSHIP_TYPES.some((rt) => rt.id === typeId);
}

/**
 * true — название не задано пользователем: пустое, старое русское название стандартного типа или
 * старое «Новый тип связи». Такое показывается переводом; совпадение с именем, которое
 * пользователь ввёл сам, отличить нельзя — тоже переводится.
 */
export function isDefaultRelationshipTypeLabel(type: RelationshipType): boolean {
  return (
    type.label === "" ||
    type.label === LEGACY_NEW_TYPE_LABEL ||
    (isStandardType(type.id) && type.label === LEGACY_DEFAULT_LABELS[type.id])
  );
}

/**
 * Название для показа. Не заданное пользователем — перевод стандартного типа по id или «Новый тип
 * связи»; всё остальное введено пользователем и показывается как есть.
 */
export function relationshipTypeLabel(type: RelationshipType): string {
  if (!isDefaultRelationshipTypeLabel(type)) return type.label;
  return isStandardType(type.id)
    ? t(`RELGRAPH.RelationshipType.Builtin.${type.id}`)
    : t("RELGRAPH.RelationshipType.DefaultName");
}

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
    label: values.label.trim(),
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
