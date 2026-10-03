/**
 * Выравнивание картинки узла. Картинка всегда заполняет узел целиком (cover), и лишнее
 * обрезается только по одной оси — по той, вдоль которой картинка длиннее узла. Значение задаёт
 * сторону для обеих осей сразу: у высокой картинки работает «сверху/снизу», у широкой —
 * «слева/справа».
 */

import type { ImageAlign } from "./model";

export const IMAGE_ALIGNS: readonly ImageAlign[] = ["top-left", "top-right", "center", "bottom-left", "bottom-right"];

/** У узла без поля (графы до 1.0.3) — по центру, как было раньше. */
export const DEFAULT_IMAGE_ALIGN: ImageAlign = "center";

/** Неизвестное значение — по центру. */
export function normalizeImageAlign(value: unknown): ImageAlign {
  return IMAGE_ALIGNS.includes(value as ImageAlign) ? (value as ImageAlign) : DEFAULT_IMAGE_ALIGN;
}

/** Положение картинки для background-position-x/y Cytoscape. */
export function imageAlignPosition(align: ImageAlign | undefined): { x: string; y: string } {
  const value = normalizeImageAlign(align);
  if (value === "center") return { x: "50%", y: "50%" };
  return {
    x: value.endsWith("left") ? "0%" : "100%",
    y: value.startsWith("top") ? "0%" : "100%",
  };
}
