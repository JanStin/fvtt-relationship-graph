import { ensureConditionDefs } from "../core/conditions";
import { ensureDefaultRelationshipTypes } from "../core/relationship-types";
import type { Faction, GraphData, GraphEdge, GraphNode, RelationshipType } from "../core/model";

export interface ParseResult {
  data: GraphData;
  warnings: string[]; // битые ссылки, неизвестные поля
}

const DEFAULT_SCALE = 1.0;

/**
 * Заглушка FANG для узлов без картинки. В наших данных заглушка не хранится: такой путь
 * превращается в пустой img, а картинку по умолчанию подставляет рендер (graph-renderer.ts).
 */
export const FANG_PLACEHOLDER_IMG = "modules/fang/assets/placeholder-npc.svg";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseFactions(raw: unknown, warnings: string[]): Faction[] {
  if (!Array.isArray(raw)) return [];
  const factions: Faction[] = [];
  raw.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      warnings.push(`factions[${index}]: отсутствует или невалиден id, узел пропущен`);
      return;
    }
    factions.push({
      id: item.id,
      name: str(item.name),
      color: str(item.color, "#888888"),
      description: str(item.description),
    });
  });
  return factions;
}

function parseRelationshipTypes(raw: unknown): RelationshipType[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "string")
    .map((item) => ({
      id: item.id as string,
      label: str(item.label),
      color: str(item.color, "#888888"),
      dash: str(item.dash),
    }));
}

function parseNodes(raw: unknown, factionIds: Set<string>, warnings: string[]): GraphNode[] {
  if (!Array.isArray(raw)) return [];
  const nodes: GraphNode[] = [];

  raw.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      warnings.push(`nodes[${index}]: отсутствует или невалиден id, узел пропущен`);
      return;
    }

    const isPlaceholder = bool(item.isPlaceholder, false);
    const actorId = typeof item.actorId === "string" ? item.actorId : null;

    const rawFactionIds = strArray(item.factionIds);
    const validFactionIds = rawFactionIds.filter((id) => factionIds.has(id));
    if (validFactionIds.length < rawFactionIds.length) {
      warnings.push(`nodes[${index}] (${item.id}): ссылка на несуществующую фракцию, проигнорирована`);
    }

    const img = str(item.img);

    nodes.push({
      id: item.id,
      type: isPlaceholder ? "placeholder" : "actor",
      actorId,
      name: str(item.name),
      originalName: str(item.originalName, str(item.name)),
      img: img === FANG_PLACEHOLDER_IMG ? "" : img,
      x: num(item.x),
      y: num(item.y),
      scale: DEFAULT_SCALE, // FANG-экспорт не содержит размера узла
      primaryFactionId: validFactionIds[0] ?? null,
      factionIds: validFactionIds,
      role: str(item.role),
      lore: str(item.lore),
      playerNotes: str(item.playerNotes),
      gmNotes: "", // отдельное поле GM-заметок — в FANG не существовало
      conditions: strArray(item.conditions),
      hidden: bool(item.hidden, false),
      gmOnly: bool(item.gmOnly, false),
    });
  });

  return nodes;
}

function parseEdges(raw: unknown, nodeIds: Set<string>, warnings: string[]): GraphEdge[] {
  if (!Array.isArray(raw)) return [];
  const edges: GraphEdge[] = [];

  raw.forEach((item, index) => {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.target !== "string") {
      warnings.push(`links[${index}]: отсутствует source/target, связь пропущена`);
      return;
    }
    if (!nodeIds.has(item.source) || !nodeIds.has(item.target)) {
      warnings.push(`links[${index}]: битая ссылка (${item.source} -> ${item.target}), связь пропущена`);
      return;
    }

    edges.push({
      id: `${item.source}-${item.target}-${index}`,
      source: item.source,
      target: item.target,
      label: str(item.label),
      directional: bool(item.directional, false),
      relationshipTypeId: str(item.relationshipType),
      gmOnly: bool(item.gmOnly, false),
    });
  });

  return edges;
}

/**
 * Парсит экспорт FANG (fang.json) в нашу модель данных.
 * Игнорирует zones[], showFactionLines/showFactionLegend, vx/vy — см. docs/fang-json-format.md.
 * Битые ссылки (links на несуществующие узлы, factionIds на несуществующие фракции)
 * не бросают ошибку — попадают в warnings[], сама связь/ссылка отбрасывается.
 */
export function parseFangJson(raw: unknown): ParseResult {
  if (!isRecord(raw)) {
    throw new Error("parseFangJson: ожидался объект верхнего уровня");
  }
  if (!Array.isArray(raw.nodes)) {
    throw new Error("parseFangJson: отсутствует или невалиден массив nodes");
  }

  const warnings: string[] = [];

  const factions = parseFactions(raw.factions, warnings);
  const factionIdSet = new Set(factions.map((f) => f.id));

  const nodes = parseNodes(raw.nodes, factionIdSet, warnings);
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const edges = parseEdges(raw.links, nodeIdSet, warnings);
  const relationshipTypes = parseRelationshipTypes(raw.relationshipTypes);

  return {
    // состояния, которых нет во встроенном наборе, попадают в справочник
    data: ensureDefaultRelationshipTypes(ensureConditionDefs({ nodes, edges, factions, relationshipTypes })),
    warnings,
  };
}
