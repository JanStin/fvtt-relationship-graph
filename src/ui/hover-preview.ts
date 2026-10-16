/**
 * Быстрый предпросмотр: через HOVER_DELAY_MS наведения на узел над ним всплывает подсказка —
 * имя, роль, основная фракция. Полные сведения — в боковой панели (panels/InfoPanel.ts).
 * Подсказка не ловит мышь и прячется при уходе с узла, нажатии, перетаскивании, панорамировании
 * и масштабе. Что показывать, решает GraphApp (describe.ts → previewNode).
 */

import type cytoscape from "cytoscape";
import type { NodePreview } from "../core/describe";

export const HOVER_DELAY_MS = 600;
/** Зазор между узлом и подсказкой, px. */
const GAP = 8;

export interface HoverPreview {
  destroy(): void;
}

/** host — обёртка графа (родитель контейнера Cytoscape), как у контекстного меню. */
export function createHoverPreview(
  host: HTMLElement,
  cy: cytoscape.Core,
  previewOf: (nodeId: string) => NodePreview | null,
): HoverPreview {
  const win = host.ownerDocument.defaultView ?? window;
  let timer: number | null = null;
  let tip: HTMLElement | null = null;

  const hide = () => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
    tip?.remove();
    tip = null;
  };

  const show = (node: cytoscape.NodeSingular) => {
    const preview = previewOf(node.id());
    if (!preview) return;
    const element = document.createElement("div");
    element.className = "frg-overlay frg-hover-preview";
    element.setAttribute("role", "tooltip");
    const title = document.createElement("div");
    title.className = "frg-hover-preview-title";
    title.textContent = preview.title;
    element.append(title);
    if (preview.role) {
      const role = document.createElement("div");
      role.className = "frg-hover-preview-role";
      role.textContent = preview.role;
      element.append(role);
    }
    if (preview.faction) {
      const faction = document.createElement("div");
      faction.className = "frg-hover-preview-faction";
      const dot = document.createElement("span");
      dot.className = "frg-info-dot";
      dot.style.background = preview.faction.color;
      faction.append(dot, preview.faction.label);
      element.append(faction);
    }
    host.append(element);
    tip = element;

    // над узлом по центру; не помещается сверху — под ним; по горизонтали — в пределах host
    const box = node.renderedBoundingBox();
    const cyRect = cy.container()!.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const offsetX = cyRect.left - hostRect.left;
    const offsetY = cyRect.top - hostRect.top;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const left = Math.max(GAP, Math.min(offsetX + (box.x1 + box.x2) / 2 - width / 2, hostRect.width - width - GAP));
    const above = offsetY + box.y1 - height - GAP;
    const top = above >= GAP ? above : offsetY + box.y2 + GAP;
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  };

  const onOver = (evt: cytoscape.EventObject) => {
    hide();
    const node = evt.target as cytoscape.NodeSingular;
    timer = win.setTimeout(() => {
      timer = null;
      show(node);
    }, HOVER_DELAY_MS);
  };

  cy.on("mouseover", "node[!isFaction]", onOver);
  cy.on("mouseout", "node[!isFaction]", hide);
  cy.on("tapstart cxttapstart grab pan zoom remove", hide);

  return {
    destroy() {
      hide();
      cy.off("mouseover", "node[!isFaction]", onOver);
      cy.off("mouseout", "node[!isFaction]", hide);
      cy.off("tapstart cxttapstart grab pan zoom remove", hide);
    },
  };
}
