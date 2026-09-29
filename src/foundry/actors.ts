/**
 * Синхронизация узлов графа с реальными актёрами Foundry (game.actors).
 * См. docs/architecture.md §2 "Связь с Foundry".
 */

import type { GraphNode } from "../core/model";

declare const game: {
  actors: { get(id: string): { img?: string; name?: string } | null | undefined };
};

/**
 * Если у узла есть actorId и актёр найден в game.actors — подтягивает его img/name.
 * Если актёр не найден — actorId обнуляется, но остальные данные узла (name, img,
 * role и т.д.) остаются как были, без изменений.
 */
export function syncNodeWithActor(node: GraphNode): GraphNode {
  if (node.actorId === null) return node;

  const actor = game.actors.get(node.actorId);
  if (!actor) {
    return { ...node, actorId: null };
  }

  return {
    ...node,
    img: actor.img ?? node.img,
    name: actor.name ?? node.name,
  };
}

export function syncNodesWithActors(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes.map(syncNodeWithActor);
}
