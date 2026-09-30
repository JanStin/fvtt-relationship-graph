/**
 * Собственный формат файла графа: экспорт и импорт без потерь — со scale,
 * справочниками, флагами видимости и заметками GM. Описание — docs/graph-json-format.md.
 *
 * Импорт распознаёт формат сам (parseGraphFile): свой — по маркеру format, иначе FANG.
 * Свой формат проходит те же нормализации, что и загрузка из хранилища.
 */

import { ensureConditionDefs, isBuiltinCondition } from "../core/conditions";
import { normalizeFactions } from "../core/edit";
import type { ConditionDef, Faction, GraphData, GraphEdge, GraphNode, NodeType, RelationshipType } from "../core/model";
import { ensureDefaultRelationshipTypes } from "../core/relationship-types";
import { SCALE_MAX, SCALE_MIN } from "../core/selection";
import { ensureNodeFlags } from "../core/visibility";
import { parseFangJson, type ParseResult } from "./fang";
import { bool, isRecord, num, str, strArray } from "./json-helpers";

/** Маркер формата — по нему импорт отличает свой файл от FANG. */
export const GRAPH_FILE_FORMAT = "fvtt-relationship-graph";
/** Версия формата. Файл новее — не читаем (появятся поля, о которых этот код не знает). */
export const GRAPH_FILE_VERSION = 1;

export interface GraphFile {
  format: typeof GRAPH_FILE_FORMAT;
  version: number;
  /** ISO-дата экспорта — для человека, при импорте не используется. */
  exportedAt: string;
  data: GraphData;
}

export function exportGraphFile(data: GraphData, exportedAt: Date = new Date()): GraphFile {
  return { format: GRAPH_FILE_FORMAT, version: GRAPH_FILE_VERSION, exportedAt: exportedAt.toISOString(), data };
}

/** Имя скачиваемого файла: relationship-graph-2026-09-30.json. */
export function exportFileName(exportedAt: Date = new Date()): string {
  return `relationship-graph-${exportedAt.toISOString().slice(0, 10)}.json`;
}

export function isGraphFile(raw: unknown): boolean {
  return isRecord(raw) && raw.format === GRAPH_FILE_FORMAT;
}

export type FileFormat = "native" | "fang";

/** Импорт любого поддерживаемого файла: свой формат или экспорт FANG. */
export function parseGraphFile(raw: unknown): ParseResult & { format: FileFormat } {
  return isGraphFile(raw) ? { ...parseGraphFileJson(raw), format: "native" } : { ...parseFangJson(raw), format: "fang" };
}

const NODE_TYPES: readonly NodeType[] = ["actor", "placeholder", "image"];

function records(raw: unknown, what: string, warnings: string[]): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item, index) => {
    const ok = isRecord(item) && typeof item.id === "string";
    if (!ok) warnings.push(`${what}[${index}]: отсутствует или невалиден id, пропущено`);
    return ok;
  }) as Record<string, unknown>[];
}

function parseNode(item: Record<string, unknown>, factions: Faction[], warnings: string[]): GraphNode {
  const id = item.id as string;
  const type = NODE_TYPES.includes(item.type as NodeType) ? (item.type as NodeType) : "placeholder";
  const actorId = type === "actor" && typeof item.actorId === "string" ? item.actorId : null;

  const known = new Set(factions.map((f) => f.id));
  const rawFactionIds = strArray(item.factionIds);
  if (rawFactionIds.some((f) => !known.has(f))) {
    warnings.push(`узел ${id}: ссылка на несуществующую фракцию, проигнорирована`);
  }
  const primary = typeof item.primaryFactionId === "string" ? item.primaryFactionId : null;
  const faction = normalizeFactions({ factions } as GraphData, rawFactionIds, primary);

  const name = str(item.name);
  return {
    id,
    type: actorId === null && type === "actor" ? "placeholder" : type,
    actorId,
    name,
    originalName: str(item.originalName, name),
    img: str(item.img),
    x: num(item.x),
    y: num(item.y),
    scale: Math.max(SCALE_MIN, Math.min(SCALE_MAX, num(item.scale, 1))),
    ...faction,
    role: str(item.role),
    lore: str(item.lore),
    playerNotes: str(item.playerNotes),
    gmNotes: str(item.gmNotes),
    conditions: strArray(item.conditions),
    hidden: bool(item.hidden),
    gmOnly: bool(item.gmOnly),
  };
}

/** Свой формат (уже распознанный по маркеру). Бросает, если файл повреждён или новее, чем поддерживается. */
export function parseGraphFileJson(raw: unknown): ParseResult {
  if (!isGraphFile(raw) || !isRecord(raw)) {
    throw new Error("parseGraphFileJson: это не файл графа Relationship Graph");
  }
  const version = num(raw.version, NaN);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("parseGraphFileJson: не указана версия формата");
  }
  if (version > GRAPH_FILE_VERSION) {
    throw new Error(
      `parseGraphFileJson: файл версии ${version}, модуль понимает до ${GRAPH_FILE_VERSION} — обновите модуль`,
    );
  }
  const data = raw.data;
  if (!isRecord(data) || !Array.isArray(data.nodes)) {
    throw new Error("parseGraphFileJson: отсутствует или невалиден массив data.nodes");
  }

  const warnings: string[] = [];

  const factions: Faction[] = records(data.factions, "factions", warnings).map((f) => ({
    id: f.id as string,
    name: str(f.name),
    color: str(f.color, "#888888"),
    description: str(f.description),
  }));
  const relationshipTypes: RelationshipType[] = records(data.relationshipTypes, "relationshipTypes", warnings).map(
    (rt) => ({ id: rt.id as string, label: str(rt.label), color: str(rt.color, "#888888"), dash: str(rt.dash) }),
  );
  // встроенные состояния живут в коде — в файле их быть не должно, а если есть, игнорируем
  const conditions: ConditionDef[] = records(data.conditions, "conditions", warnings)
    .filter((c) => !isBuiltinCondition(c.id as string))
    .map((c) => ({ id: c.id as string, label: str(c.label, c.id as string), icon: str(c.icon) }));

  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const item of records(data.nodes, "nodes", warnings)) {
    if (nodeIds.has(item.id as string)) {
      warnings.push(`узел ${item.id}: повторяющийся id, пропущен`);
      continue;
    }
    nodeIds.add(item.id as string);
    nodes.push(parseNode(item, factions, warnings));
  }

  const typeIds = new Set(relationshipTypes.map((rt) => rt.id));
  const edges: GraphEdge[] = [];
  const edgeIds = new Set<string>();
  for (const item of records(data.edges, "edges", warnings)) {
    const id = item.id as string;
    const source = str(item.source);
    const target = str(item.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      warnings.push(`связь ${id}: битая ссылка (${source} -> ${target}), пропущена`);
      continue;
    }
    if (edgeIds.has(id)) {
      warnings.push(`связь ${id}: повторяющийся id, пропущена`);
      continue;
    }
    edgeIds.add(id);
    const relationshipTypeId = str(item.relationshipTypeId);
    edges.push({
      id,
      source,
      target,
      label: str(item.label),
      directional: bool(item.directional),
      relationshipTypeId: typeIds.has(relationshipTypeId) ? relationshipTypeId : "",
      gmOnly: bool(item.gmOnly),
    });
  }

  return {
    // те же нормализации, что и при загрузке из хранилища (foundry/storage.ts)
    data: ensureNodeFlags(
      ensureDefaultRelationshipTypes(ensureConditionDefs({ nodes, edges, factions, relationshipTypes, conditions })),
    ),
    warnings,
  };
}
