/**
 * Фон графа под канвасом Cytoscape: цвет контейнера и картинка в координатах графа —
 * одним изображением (как карта) или плитками (текстура). Картинка двигается и масштабируется
 * вместе с узлами. Геометрия — core/background.ts.
 *
 * Слой вставляется в начало контейнера: позиционированные элементы рисуются в порядке DOM,
 * и всё, что стоит раньше контейнера канвасов Cytoscape (position: relative; z-index: 0),
 * оказывается под ним. Мышь слой не ловит.
 */

import type cytoscape from "cytoscape";
import { backgroundColor, backgroundImageRect, tileScreenLayout, type Size } from "../core/background";
import type { GraphBackground } from "../core/model";

export interface BackgroundLayer {
  destroy(): void;
}

/** CSS url() для пути с пробелами и кавычками. */
function cssUrl(path: string): string {
  return `url(${JSON.stringify(path)})`;
}

export function createBackgroundLayer(
  container: HTMLElement,
  cy: cytoscape.Core,
  background: GraphBackground | null | undefined,
): BackgroundLayer {
  container.style.background = backgroundColor(background);

  const layer = document.createElement("div");
  layer.className = "frg-background";
  container.prepend(layer);

  let destroyed = false;
  let detach: (() => void) | null = null;

  if (background?.image) {
    layer.style.opacity = String(background.imageOpacity);
    const probe = new Image();
    probe.addEventListener("load", () => {
      if (destroyed) return;
      const natural: Size = { width: probe.naturalWidth, height: probe.naturalHeight };
      detach = background.imageMode === "tile" ? showTiles(layer, cy, background, natural) : showSingle(layer, cy, background, natural);
    });
    probe.addEventListener("error", () => {
      console.warn(`fvtt-relationship-graph | background image not loaded: ${background.image}`);
    });
    probe.src = background.image;
  }

  return {
    destroy(): void {
      destroyed = true;
      detach?.();
      layer.remove();
    },
  };
}

/** Текстура: CSS-фон слоя, размер и смещение плиток пересчитываются при панорамировании и зуме. */
function showTiles(layer: HTMLElement, cy: cytoscape.Core, background: GraphBackground, natural: Size): () => void {
  const rect = backgroundImageRect(background, natural);
  layer.style.backgroundImage = cssUrl(background.image);
  layer.style.backgroundRepeat = "repeat";
  const sync = () => {
    const tile = tileScreenLayout(rect, { pan: cy.pan(), zoom: cy.zoom() });
    layer.style.backgroundSize = `${tile.width}px ${tile.height}px`;
    layer.style.backgroundPosition = `${tile.x}px ${tile.y}px`;
  };
  cy.on("viewport", sync);
  sync();
  return () => cy.off("viewport", sync);
}

/** Одно изображение: <img> в модельных координатах, контейнер повторяет pan/zoom (как node-decor.ts). */
function showSingle(layer: HTMLElement, cy: cytoscape.Core, background: GraphBackground, natural: Size): () => void {
  const rect = backgroundImageRect(background, natural);
  const viewport = document.createElement("div");
  viewport.className = "frg-background-viewport";
  const image = document.createElement("img");
  image.src = background.image;
  image.alt = "";
  image.draggable = false;
  image.style.left = `${rect.x}px`;
  image.style.top = `${rect.y}px`;
  image.style.width = `${rect.width}px`;
  image.style.height = `${rect.height}px`;
  viewport.append(image);
  layer.append(viewport);

  const sync = () => {
    const pan = cy.pan();
    viewport.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${cy.zoom()})`;
  };
  cy.on("viewport", sync);
  sync();
  return () => cy.off("viewport", sync);
}
