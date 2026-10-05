/**
 * Области фракций: какие узлы входят в область какой фракции. Чистая логика поверх GraphData —
 * отрисовка в ui/faction-blobs.ts, выделение и попадание мышью — в ui/interaction.ts.
 *
 * Основная фракция узла — всегда его область. Дополнительные — только в режиме "areas"
 * (GraphBackground.factionDisplay); в режиме "badges" они показаны ромбиками на узле (core/decor.ts).
 * Раскладка от режима не зависит: compound-родитель узла — по-прежнему основная фракция.
 */

import { factionDisplayOf } from "./background";
import type { GraphData, GraphNode } from "./model";

export interface FactionArea {
  factionId: string;
  /** id узлов области в порядке data.nodes. */
  nodeIds: string[];
}

/** Фракции, в области которых входит узел; неизвестные фракции пропускаются. */
export function nodeAreaFactionIds(node: GraphNode, data: GraphData): string[] {
  const known = new Set(data.factions.map((f) => f.id));
  const ids = factionDisplayOf(data.background) === "areas" ? node.factionIds : [node.primaryFactionId];
  return [...new Set(ids)].filter((id): id is string => id !== null && known.has(id));
}

/** Области всех фракций, в которых есть хоть один узел, — в порядке data.factions (порядок отрисовки). */
export function factionAreas(data: GraphData): FactionArea[] {
  const nodeIdsByFaction = new Map<string, string[]>();
  data.nodes.forEach((node) => {
    nodeAreaFactionIds(node, data).forEach((factionId) => {
      nodeIdsByFaction.set(factionId, [...(nodeIdsByFaction.get(factionId) ?? []), node.id]);
    });
  });
  return data.factions
    .filter((faction) => nodeIdsByFaction.has(faction.id))
    .map((faction) => ({ factionId: faction.id, nodeIds: nodeIdsByFaction.get(faction.id) ?? [] }));
}

/**
 * Какую область выбрать, когда точка внутри нескольких (hits — от более глубокой к менее, см.
 * core/blob.findBlobsAt): основную фракцию ближайшего к точке узла, если её область среди них,
 * иначе — самую глубокую.
 */
export function pickArea(hits: readonly string[], nearestPrimaryArea: string | null): string | null {
  if (nearestPrimaryArea !== null && hits.includes(nearestPrimaryArea)) return nearestPrimaryArea;
  return hits[0] ?? null;
}
