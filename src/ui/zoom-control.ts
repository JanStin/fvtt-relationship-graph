/**
 * Ползунок масштаба в правом нижнем углу графа: «+», вертикальный ползунок, «−», «показать
 * весь граф» и текущий масштаб. Масштаб меняется относительно центра вида. Математика
 * ползунка — core/zoom.ts. Двойной клик по процентам (или Enter на них) — поле, где масштаб
 * вводится числом.
 *
 * Контрол живёт в wrapper окна (как контекстное меню), а не в контейнере Cytoscape — иначе
 * клики и колесо над ним доходили бы до графа. Создаётся один раз на окно; после каждой
 * перерисовки графа GraphApp заново привязывает его к новому cytoscape (attach).
 */

import type cytoscape from "cytoscape";
import { t } from "../core/i18n";
import {
  formatZoom,
  parseZoomPercent,
  sliderToZoom,
  stepZoom,
  ZOOM_PERCENT_MAX,
  ZOOM_PERCENT_MIN,
  ZOOM_SLIDER_STEPS,
  zoomToSlider,
} from "../core/zoom";
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

  const zoomIn = iconButton("fa-plus", t("RELGRAPH.Graph.ZoomIn"));
  const zoomOut = iconButton("fa-minus", t("RELGRAPH.Graph.ZoomOut"));
  const fit = iconButton("fa-expand", t("RELGRAPH.Graph.FitAll"));
  for (const button of [zoomIn, zoomOut, fit]) button.className = "frg-zoom-button";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "frg-zoom-slider";
  slider.min = "0";
  slider.max = String(ZOOM_SLIDER_STEPS);
  slider.step = "1";
  slider.title = t("RELGRAPH.Graph.Zoom");
  slider.setAttribute("aria-label", t("RELGRAPH.Graph.Zoom"));

  // Горизонтальный ползунок, повёрнутый на −90° внутри рамки: вертикальный writing-mode
  // ломал размеры дорожки и бегунка из стилей Foundry (бегунок выходил уже дорожки).
  const sliderBox = document.createElement("div");
  sliderBox.className = "frg-zoom-slider-box";
  sliderBox.append(slider);

  // проценты — кнопка: до неё доходит Tab, Enter открывает ввод, как двойной клик
  const label = document.createElement("button");
  label.type = "button";
  label.className = "frg-zoom-label";
  label.title = t("RELGRAPH.Graph.ZoomInputHint", { min: ZOOM_PERCENT_MIN, max: ZOOM_PERCENT_MAX });
  label.setAttribute("aria-label", label.title);

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

  /** Поле ввода масштаба на месте процентов; Enter / уход из поля — применить, Esc — отмена. */
  const editZoom = () => {
    if (!cy || label.hidden) return;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.className = "frg-zoom-input";
    input.setAttribute("spellcheck", "false");
    input.value = String(Math.round(cy.zoom() * 100));
    input.setAttribute("aria-label", label.title);
    let done = false;
    const finish = (apply: boolean) => {
      if (done) return;
      done = true;
      const zoom = apply ? parseZoomPercent(input.value) : null;
      if (zoom !== null) zoomTo(zoom);
      input.remove();
      label.hidden = false;
      sync();
      label.focus();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        // Esc не должен закрыть окно графа или панель
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
    label.hidden = true;
    label.after(input);
    input.focus();
    input.select();
  };
  label.addEventListener("dblclick", editZoom);
  label.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    editZoom();
  });

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
