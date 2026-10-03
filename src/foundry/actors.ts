/**
 * Синхронизация узлов графа с реальными актёрами Foundry (game.actors).
 * См. docs/architecture.md §2 "Связь с Foundry".
 */

import type { GraphNode } from "../core/model";
import { pickActorImage } from "../core/node-image";

declare const game: {
  actors: {
    get(id: string): { img?: string; name?: string; prototypeToken?: { texture?: { src?: string | null } } } | null | undefined;
  };
};

/**
 * Если у узла есть actorId и актёр найден в game.actors — подтягивает его name и картинку:
 * портрет или картинку токена (по imageSource узла, см. core/node-image.ts).
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
    img: pickActorImage(node.imageSource, actor.img, actor.prototypeToken?.texture?.src ?? undefined) ?? node.img,
    name: actor.name ?? node.name,
  };
}

export function syncNodesWithActors(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes.map(syncNodeWithActor);
}
