/**
 * Ползунок масштаба в правом нижнем углу графа: «+», вертикальный ползунок, «−», «показать
 * весь граф» и текущий масштаб. Масштаб меняется относительно центра вида. Математика
 * ползунка — core/zoom.ts.
 *
 * Контрол живёт в wrapper окна (как контекстное меню), а не в контейнере Cytoscape — иначе
 * клики и колесо над ним доходили бы до графа. Создаётся один раз на окно; после каждой
 * перерисовки графа GraphApp заново привязывает его к новому cytoscape (attach).
 */

import type cytoscape from "cytoscape";
import { formatZoom, sliderToZoom, stepZoom, ZOOM_SLIDER_STEPS, zoomToSlider } from "../core/zoom";
import { iconButton } from "./panels/form";

/** Отступ от краёв при «показать весь граф» — как в контекстном меню. */
const FIT_PADDING = 30;

export interface ZoomControl {
  element: HTMLElement;
  /** Привязать к текущему cytoscape (после каждой перерисовки графа). */
  attach(cy: cytoscape.Core): void;
  destroy(): void;
}

export function createZoomControl(): ZoomControl {
  let cy: cytoscape.Core | null = null;

  const element = document.createElement("div");
  element.className = "frg-zoom";

  const zoomIn = iconButton("fa-plus", "Приблизить");
  const zoomOut = iconButton("fa-minus", "Отдалить");
  const fit = iconButton("fa-expand", "Показать весь граф");
  for (const button of [zoomIn, zoomOut, fit]) button.className = "frg-zoom-button";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "frg-zoom-slider";
  slider.min = "0";
  slider.max = String(ZOOM_SLIDER_STEPS);
  slider.step = "1";
  slider.title = "Масштаб";
  slider.setAttribute("aria-label", "Масштаб");

  // Горизонтальный ползунок, повёрнутый на −90° внутри рамки: вертикальный writing-mode
  // ломал размеры дорожки и бегунка из стилей Foundry (бегунок выходил уже дорожки).
  const sliderBox = document.createElement("div");
  sliderBox.className = "frg-zoom-slider-box";
  sliderBox.append(slider);

  const label = document.createElement("div");
  label.className = "frg-zoom-label";

  element.append(zoomIn, sliderBox, zoomOut, fit, label);

  /** Масштаб относительно центра видимой области. */
  const zoomTo = (level: number) => {
    if (!cy) return;
    cy.zoom({ level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  };

  const sync = () => {
    if (!cy) return;
    const zoom = cy.zoom();
    const position = zoomToSlider(zoom);
    slider.value = String(position);
    // заполненная часть дорожки — от минимума до бегунка (стиль — module.css)
    slider.style.setProperty("--frg-zoom-fill", `${(position / ZOOM_SLIDER_STEPS) * 100}%`);
    label.textContent = formatZoom(zoom);
  };

  zoomIn.addEventListener("click", () => cy && zoomTo(stepZoom(cy.zoom(), 1)));
  zoomOut.addEventListener("click", () => cy && zoomTo(stepZoom(cy.zoom(), -1)));
  fit.addEventListener("click", () => cy?.fit(undefined, FIT_PADDING));
  slider.addEventListener("input", () => zoomTo(sliderToZoom(Number(slider.value))));
  // колесо над контролом не должно прокручивать страницу или окно
  element.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

  return {
    element,
    attach(newCy: cytoscape.Core): void {
      cy?.off("zoom", sync);
      cy = newCy;
      cy.on("zoom", sync);
      sync();
    },
    destroy(): void {
      cy?.off("zoom", sync);
      cy = null;
      element.remove();
    },
  };
}
