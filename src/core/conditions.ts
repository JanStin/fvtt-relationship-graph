/**
 * Справочник состояний узлов: встроенный набор + свои (GraphData.conditions).
 * Встроенные живут в коде и не редактируются; в данных хранятся только свои.
 * Узел ссылается на состояния по id (GraphNode.conditions).
 */

import type { ConditionDef, GraphData } from "./model";

export const DEFAULT_CONDITION_ICON = "fa-tag";

/** id совпадают со строками состояний из экспорта FANG. */
export const BUILTIN_CONDITIONS: readonly ConditionDef[] = [
  { id: "deceased", label: "Мёртв", icon: "fa-skull" },
  { id: "questgiver", label: "Даёт задание", icon: "fa-circle-exclamation" },
  { id: "captured", label: "В плену", icon: "fa-link" },
  { id: "missing", label: "Пропал", icon: "fa-circle-question" },
];

export interface ConditionEditValues {
  label: string;
  /** Класс иконки Font Awesome: "fa-skull" или полный набор классов "fa-regular fa-star". */
  icon: string;
}

export function isBuiltinCondition(conditionId: string): boolean {
  return BUILTIN_CONDITIONS.some((c) => c.id === conditionId);
}

/** Весь справочник: встроенные, затем свои. */
export function allConditions(data: GraphData): ConditionDef[] {
  return [...BUILTIN_CONDITIONS, ...data.conditions];
}

/** Классы для <i>: одиночное "fa-skull" дополняется стилем fa-solid, набор классов идёт как есть. */
export function conditionIconClass(icon: string): string {
  const trimmed = icon.trim() || DEFAULT_CONDITION_ICON;
  return /\s/.test(trimmed) ? trimmed : `fa-solid ${trimmed}`;
}

/**
 * Приводит данные к текущей модели: граф, сохранённый до появления справочника (без поля
 * conditions), и свежий импорт получают справочник, а неизвестные состояния узлов попадают
 * в него автоматически — с id и названием из самой строки и иконкой по умолчанию.
 */
export function ensureConditionDefs(data: Omit<GraphData, "conditions"> & { conditions?: ConditionDef[] }): GraphData {
  const conditions = [...(data.conditions ?? [])];
  const known = new Set([...BUILTIN_CONDITIONS, ...conditions].map((c) => c.id));

  for (const node of data.nodes) {
    for (const id of node.conditions) {
      if (known.has(id)) continue;
      known.add(id);
      conditions.push({ id, label: id, icon: DEFAULT_CONDITION_ICON });
    }
  }
  return { ...data, conditions };
}

function assertCustom(fn: string, data: GraphData, conditionId: string): void {
  if (isBuiltinCondition(conditionId)) {
    throw new Error(`${fn}: condition "${conditionId}" is built-in`);
  }
  if (!data.conditions.some((c) => c.id === conditionId)) {
    throw new Error(`${fn}: condition "${conditionId}" not found`);
  }
}

/** id генерирует вызывающий (core не знает про Foundry). Пустое название — «Новое состояние». */
export function createCondition(data: GraphData, conditionId: string, values: ConditionEditValues): GraphData {
  if (allConditions(data).some((c) => c.id === conditionId)) {
    throw new Error(`createCondition: condition "${conditionId}" already exists`);
  }
  const condition: ConditionDef = {
    id: conditionId,
    label: values.label.trim() || "Новое состояние",
    icon: values.icon.trim() || DEFAULT_CONDITION_ICON,
  };
  return { ...data, conditions: [...data.conditions, condition] };
}

/** Пустое название оставляет прежнее, пустая иконка — иконку по умолчанию. Встроенные не меняются. */
export function updateCondition(data: GraphData, conditionId: string, values: ConditionEditValues): GraphData {
  assertCustom("updateCondition", data, conditionId);
  const label = values.label.trim();
  return {
    ...data,
    conditions: data.conditions.map((c) =>
      c.id === conditionId
        ? { id: c.id, label: label || c.label, icon: values.icon.trim() || DEFAULT_CONDITION_ICON }
        : c,
    ),
  };
}

/** Удаляет своё состояние из справочника и снимает его со всех узлов. Встроенные не удаляются. */
export function removeCondition(data: GraphData, conditionId: string): GraphData {
  assertCustom("removeCondition", data, conditionId);
  return {
    ...data,
    conditions: data.conditions.filter((c) => c.id !== conditionId),
    nodes: data.nodes.map((n) =>
      n.conditions.includes(conditionId) ? { ...n, conditions: n.conditions.filter((id) => id !== conditionId) } : n,
    ),
  };
}
