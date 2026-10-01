/**
 * Масштаб вида: пределы и перевод в положение ползунка (ui/zoom-control.ts). Ползунок
 * логарифмический — шаг ползунка одинаково заметен и при 10 %, и при 400 %.
 */

/** Пределы масштаба вида — и для колеса, и для ползунка (graph-renderer.ts). */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 5;
/** Во сколько раз меняют масштаб кнопки «+» и «−». */
export const ZOOM_STEP_FACTOR = 1.25;
/** Число делений ползунка. */
export const ZOOM_SLIDER_STEPS = 1000;

function clamp(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Масштаб → положение ползунка 0…ZOOM_SLIDER_STEPS. */
export function zoomToSlider(zoom: number): number {
  const t = Math.log(clamp(zoom) / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
  return Math.round(t * ZOOM_SLIDER_STEPS);
}

/** Положение ползунка → масштаб. */
export function sliderToZoom(value: number): number {
  const t = Math.min(1, Math.max(0, value / ZOOM_SLIDER_STEPS));
  return clamp(ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, t));
}

/** Шаг кнопками «+» (direction = 1) и «−» (direction = -1), в пределах ZOOM_MIN…ZOOM_MAX. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clamp(direction > 0 ? zoom * ZOOM_STEP_FACTOR : zoom / ZOOM_STEP_FACTOR);
}

/** Подпись масштаба: «125 %». */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}
