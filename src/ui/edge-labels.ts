/**
 * Держит подписи связей без наложений: после каждого движения или ресайза узлов
 * пересчитывает, где на связи стоит подпись (core/label-layout.ts), и кладёт результат
 * в data.labelOffset — стиль связи рисует подпись на этом расстоянии от узла-источника
 * (source-label + source-text-offset, см. graph-renderer.ts).
 */

import type cytoscape from "cytoscape";
import { estimateLabelSize, layoutEdgeLabels, type LabelEdge } from "../core/label-layout";

export const EDGE_LABEL_FONT_SIZE = 8;

export interface EdgeLabelsHandle {
  destroy(): void;
}

function endpoint(node: cytoscape.NodeSingular): LabelEdge["source"] {
  const position = node.position();
  return { x: position.x, y: position.y, radius: (node.data("size") as number) / 2 };
}

function relayout(cy: cytoscape.Core): void {
  const edges: LabelEdge[] = cy.edges().map((edge) => {
    const size = estimateLabelSize((edge.data("label") as string | undefined) ?? "", EDGE_LABEL_FONT_SIZE);
    return {
      id: edge.id(),
      source: endpoint(edge.source()),
      target: endpoint(edge.target()),
      labelWidth: size.width,
      labelHeight: size.height,
    };
  });
  const offsets = layoutEdgeLabels(edges);

  cy.batch(() => {
    offsets.forEach((offset, id) => {
      const edge = cy.getElementById(id);
      if (edge.data("labelOffset") !== offset) edge.data("labelOffset", offset);
    });
  });
}

/** Вызывать после cytoscape(...). Пересчёт — не чаще раза за кадр. */
export function setupEdgeLabels(cy: cytoscape.Core): EdgeLabelsHandle {
  let frame: number | null = null;
  const schedule = () => {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      relayout(cy);
    });
  };

  // position — drag/раскладка/сепарация, data — resize узла (меняется data.size).
  cy.on("position data", "node[!isFaction]", schedule);
  relayout(cy);

  return {
    destroy(): void {
      cy.off("position data", "node[!isFaction]", schedule);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
