/**
 * Чистые immutable-мутации GraphData: не мутируют вход, возвращают новый объект.
 * Не зависит от Cytoscape/Foundry — см. docs/architecture.md §8 (src/core/ не знает о Foundry).
 */

import type { GraphData, GraphEdge, GraphNode } from "./model";

export function addNode(data: GraphData, node: GraphNode): GraphData {
  if (data.nodes.some((n) => n.id === node.id)) {
    throw new Error(`addNode: node "${node.id}" already exists`);
  }
  return { ...data, nodes: [...data.nodes, node] };
}

/** Удаляет узел и каскадно все связи, где он был source или target. Не найден — тихий no-op. */
export function removeNode(data: GraphData, nodeId: string): GraphData {
  return {
    ...data,
    nodes: data.nodes.filter((n) => n.id !== nodeId),
    edges: data.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  };
}

export function updateNode(data: GraphData, nodeId: string, patch: Partial<Omit<GraphNode, "id">>): GraphData {
  let found = false;
  const nodes = data.nodes.map((n) => {
    if (n.id !== nodeId) return n;
    found = true;
    return { ...n, ...patch, id: n.id };
  });
  if (!found) {
    throw new Error(`updateNode: node "${nodeId}" not found`);
  }
  return { ...data, nodes };
}

export function addEdge(data: GraphData, edge: GraphEdge): GraphData {
  if (data.edges.some((e) => e.id === edge.id)) {
    throw new Error(`addEdge: edge "${edge.id}" already exists`);
  }
  if (!data.nodes.some((n) => n.id === edge.source)) {
    throw new Error(`addEdge: source node "${edge.source}" not found`);
  }
  if (!data.nodes.some((n) => n.id === edge.target)) {
    throw new Error(`addEdge: target node "${edge.target}" not found`);
  }
  return { ...data, edges: [...data.edges, edge] };
}

/** Не найдена — тихий no-op (симметрично removeNode). */
export function removeEdge(data: GraphData, edgeId: string): GraphData {
  return { ...data, edges: data.edges.filter((e) => e.id !== edgeId) };
}

export function updateEdge(data: GraphData, edgeId: string, patch: Partial<Omit<GraphEdge, "id">>): GraphData {
  let found = false;
  const edges = data.edges.map((e) => {
    if (e.id !== edgeId) return e;
    found = true;
    return { ...e, ...patch, id: e.id };
  });
  if (!found) {
    throw new Error(`updateEdge: edge "${edgeId}" not found`);
  }
  return { ...data, edges };
}

/**
 * Меняет primary-фракцию узла (в Cytoscape это смена compound-родителя, см. §3).
 * factionId === null — узел становится без фракции вообще (factionIds очищается).
 * Иначе factionId ставится первым элементом factionIds (primaryFactionId = factionIds[0]),
 * остальные ранее присвоенные фракции узла сохраняются как вторичные бейджи (см. §1).
 */
export function moveFaction(data: GraphData, nodeId: string, factionId: string | null): GraphData {
  if (factionId !== null && !data.factions.some((f) => f.id === factionId)) {
    throw new Error(`moveFaction: faction "${factionId}" not found`);
  }

  let found = false;
  const nodes = data.nodes.map((n) => {
    if (n.id !== nodeId) return n;
    found = true;
    if (factionId === null) {
      return { ...n, primaryFactionId: null, factionIds: [] };
    }
    const secondary = n.factionIds.filter((id) => id !== factionId);
    return { ...n, primaryFactionId: factionId, factionIds: [factionId, ...secondary] };
  });

  if (!found) {
    throw new Error(`moveFaction: node "${nodeId}" not found`);
  }
  return { ...data, nodes };
}
