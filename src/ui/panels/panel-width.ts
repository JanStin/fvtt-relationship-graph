/**
 * Ширина боковых панелей (сведения, формы, поиск, списки) — одна на все: левый край любой панели
 * перетаскивается, ширина запоминается у клиента в localStorage и достаётся следующей панели,
 * так что переход «Изменить» из сведений ширину не меняет. Ползунок масштаба сдвигается на ширину
 * панели через CSS-переменную --frg-panel-width окна графа (module.css).
 * Хранилище может быть недоступно (приватное окно, запрет сайта) — тогда ширина по умолчанию.
 */

import { t } from "../../core/i18n";
import { MODULE_ID } from "../../foundry/settings";

const WIDTH_KEY = `${MODULE_ID}.panelWidth`;

export const PANEL_DEFAULT_WIDTH = 360;
export const PANEL_MIN_WIDTH = 280;
/** Доля окна графа, больше которой панель не растёт, — граф должен оставаться видимым. */
export const PANEL_MAX_SHARE = 0.6;
/** Шаг стрелок на краю панели, px. */
const KEY_STEP = 20;

/**
 * Ширина в допустимых пределах: не уже PANEL_MIN_WIDTH и не шире доли окна графа.
 * В очень узком окне верхняя граница важнее нижней.
 */
export function clampPanelWidth(width: number, hostWidth: number): number {
  const max = Math.max(0, hostWidth * PANEL_MAX_SHARE);
  return Math.round(Math.min(Math.max(width, PANEL_MIN_WIDTH), max));
}

/** Сохранённая ширина; нет или испорчена — по умолчанию. Пределы окна применяет CSS (max-width). */
export function loadPanelWidth(): number {
  let width = Number.NaN;
  try {
    width = Number(globalThis.localStorage?.getItem(WIDTH_KEY));
  } catch {
    // нет хранилища — ширина по умолчанию
  }
  return Number.isFinite(width) && width >= PANEL_MIN_WIDTH ? width : PANEL_DEFAULT_WIDTH;
}

export function savePanelWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(WIDTH_KEY, String(Math.round(width)));
  } catch {
    // нет хранилища — ширина живёт до перезагрузки
  }
}

/** Ширину панели знает и ползунок масштаба: переменная на окне графа, общем родителе обоих. */
function syncPanelWidth(panel: HTMLElement): void {
  panel.parentElement?.style.setProperty("--frg-panel-width", panel.style.width);
}

/**
 * Панель, только что вставленная в окно графа: сохранённая ширина, край для её изменения и
 * переменная для ползунка масштаба.
 */
export function attachPanelWidth(panel: HTMLElement): void {
  panel.style.width = `${loadPanelWidth()}px`;
  panel.prepend(resizeHandle(panel));
  syncPanelWidth(panel);
}

/**
 * Левый край панели: перетаскивание меняет ширину (в пределах clampPanelWidth), стрелки
 * влево/вправо — то же с клавиатуры. Ширина запоминается по окончании.
 */
function resizeHandle(panel: HTMLElement): HTMLElement {
  const handle = document.createElement("div");
  handle.className = "frg-panel-resize";
  handle.tabIndex = 0;
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", "vertical");
  handle.setAttribute("aria-label", t("RELGRAPH.Common.ResizePanel"));
  handle.title = t("RELGRAPH.Common.ResizePanel");

  const hostWidth = () => panel.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY;
  const apply = (width: number) => {
    const clamped = clampPanelWidth(width, hostWidth());
    panel.style.width = `${clamped}px`;
    syncPanelWidth(panel);
    return clamped;
  };

  let drag: { startX: number; startWidth: number } | null = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { startX: e.clientX, startWidth: panel.getBoundingClientRect().width };
    handle.setPointerCapture(e.pointerId);
    panel.classList.add("frg-panel-resizing");
  });
  handle.addEventListener("pointermove", (e) => {
    // панель у правого края: тянем влево — шире
    if (drag) apply(drag.startWidth + drag.startX - e.clientX);
  });
  const finish = () => {
    if (!drag) return;
    drag = null;
    panel.classList.remove("frg-panel-resizing");
    savePanelWidth(panel.getBoundingClientRect().width);
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
  handle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP;
    savePanelWidth(apply(panel.getBoundingClientRect().width + step));
  });
  return handle;
}
