/**
 * HTML-слой поверх канваса Cytoscape: имя и роль под узлом, ромбики дополнительных фракций
 * (слева сверху), иконки состояний (справа сверху) и окольцовка скрытого узла. Подход проверен
 * спайком: подпись Cytoscape одностилевая, бейджей у неё нет.
 *
 * Один контейнер повторяет pan/zoom графа через CSS transform, а элементы узлов стоят в
 * МОДЕЛЬНЫХ координатах — при панорамировании и зуме меняется только transform контейнера.
 * Мышь слой не ловит (pointer-events: none в styles/module.css). Что именно рисовать —
 * решает core/decor.ts.
 */

import type cytoscape from "cytoscape";
import { buildNodeDecor, type DecorOptions, type NodeDecor } from "../core/decor";
import type { GraphData } from "../core/model";

export interface NodeDecorLayer {
  destroy(): void;
}

function el(className: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = className;
  return div;
}

/** faClasses — готовый набор классов Font Awesome (см. core/conditions.conditionIconClass). */
function icon(faClasses: string): HTMLElement {
  const i = document.createElement("i");
  i.className = faClasses;
  return i;
}

/** «Ещё значки»: простой знак «+» на месте третьего значка. */
function plus(): HTMLElement {
  const element = el("frg-badge-plus");
  element.textContent = "+";
  return element;
}

function buildElement(decor: NodeDecor): HTMLElement {
  const root = el("frg-node-decor");
  if (decor.hidden) root.append(el("frg-node-ring"));

  const factions = el("frg-badges frg-badges-factions");
  decor.factions.shown.forEach((color) => {
    const diamond = el("frg-diamond");
    diamond.style.background = color;
    factions.append(diamond);
  });
  if (decor.factions.more) {
    factions.append(plus());
  }

  const conditions = el("frg-badges frg-badges-conditions");
  decor.conditions.shown.forEach((condition) => {
    const badge = el("frg-condition");
    badge.append(icon(condition.icon));
    conditions.append(badge);
  });
  if (decor.conditions.more) {
    conditions.append(plus());
  }

  const caption = el("frg-node-caption");
  const name = el("frg-node-name");
  name.textContent = decor.name;
  caption.append(name);
  if (decor.role) {
    const role = el("frg-node-role");
    role.textContent = decor.role;
    caption.append(role);
  }

  root.append(factions, conditions, caption);
  return root;
}

/**
 * Вызывать после cytoscape(...) на том же container: слой должен оказаться в DOM позже
 * канвасов Cytoscape, чтобы рисоваться поверх них.
 */
export function createNodeDecorLayer(
  container: HTMLElement,
  cy: cytoscape.Core,
  data: GraphData,
  options: DecorOptions,
): NodeDecorLayer {
  const layer = el("frg-decor-layer");
  const elementById = new Map<string, HTMLElement>();

  data.nodes.forEach((node) => {
    const element = buildElement(buildNodeDecor(data, node, options));
    elementById.set(node.id, element);
    layer.append(element);
  });
  container.append(layer);

  const syncViewport = () => {
    const pan = cy.pan();
    layer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${cy.zoom()})`;
  };
  const syncNode = (node: cytoscape.NodeSingular) => {
    const element = elementById.get(node.id());
    if (!element) return;
    const position = node.position();
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    element.style.setProperty("--frg-size", `${node.data("size") as number}px`);
  };
  // position — drag/раскладка/сепарация, data — resize (interaction.ts меняет data.size).
  const onNodeChanged = (evt: cytoscape.EventObject) => syncNode(evt.target as cytoscape.NodeSingular);

  cy.on("viewport", syncViewport);
  cy.on("position data", "node[!isFaction]", onNodeChanged);
  syncViewport();
  cy.nodes("[!isFaction]").forEach(syncNode);

  return {
    destroy(): void {
      cy.off("viewport", syncViewport);
      cy.off("position data", "node[!isFaction]", onNodeChanged);
      layer.remove();
    },
  };
}
