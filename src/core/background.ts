/**
 * Фон графа: применение значений формы (panels/BackgroundPanel.ts) и геометрия картинки
 * в координатах графа. Чистая логика — отрисовку делает ui/background-layer.ts.
 *
 * Картинка лежит в координатах графа (как карта): при панорамировании и зуме она двигается
 * и масштабируется вместе с узлами. Текстура — та же картинка плитками от точки привязки.
 */

import type { BackgroundImageMode, GraphBackground, GraphData } from "./model";

/** Стандартный цвет фона графа (без настроек). */
export const DEFAULT_BACKGROUND_COLOR = "#16213e";
const MIN_OPACITY = 0.05;
/** Меньше — плитки текстуры превращаются в рябь, а браузер — в печку. */
const MIN_IMAGE_WIDTH = 16;

export const BACKGROUND_IMAGE_MODES: readonly BackgroundImageMode[] = ["tile", "single"];

export function defaultBackground(): GraphBackground {
  return { color: "", image: "", imageMode: "single", imageX: 0, imageY: 0, imageWidth: 0, imageOpacity: 1 };
}

/** Значения формы фона: числа приходят текстом из полей ввода. */
export interface BackgroundEditValues {
  color: string;
  image: string;
  imageMode: BackgroundImageMode;
  imageX: string;
  imageY: string;
  imageWidth: string;
  /** Непрозрачность в процентах. */
  imageOpacityPercent: string;
}

function parseNumber(text: string, fallback: number): number {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : fallback;
}

/** Фон из значений формы; неверные числа заменяются значениями по умолчанию. */
export function backgroundFromEdit(values: BackgroundEditValues): GraphBackground {
  const defaults = defaultBackground();
  const width = parseNumber(values.imageWidth, 0);
  const opacityPercent = parseNumber(values.imageOpacityPercent, 100);
  return {
    color: values.color.trim(),
    image: values.image.trim(),
    imageMode: BACKGROUND_IMAGE_MODES.includes(values.imageMode) ? values.imageMode : defaults.imageMode,
    imageX: parseNumber(values.imageX, 0),
    imageY: parseNumber(values.imageY, 0),
    imageWidth: width <= 0 ? 0 : Math.max(MIN_IMAGE_WIDTH, width),
    imageOpacity: Math.min(1, Math.max(MIN_OPACITY, opacityPercent / 100)),
  };
}

/** Фон без цвета и картинки ничем не отличается от стандартного. */
export function isDefaultBackground(background: GraphBackground): boolean {
  return background.color === "" && background.image === "";
}

/** Задаёт фон графа; стандартный фон хранится как null (см. GraphData.background). */
export function setBackground(data: GraphData, background: GraphBackground | null): GraphData {
  return { ...data, background: background && !isDefaultBackground(background) ? background : null };
}

/** Цвет, которым заливается фон графа. */
export function backgroundColor(background: GraphBackground | null | undefined): string {
  return background?.color || DEFAULT_BACKGROUND_COLOR;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Картинка (или одна плитка текстуры) в координатах графа; natural — натуральный размер файла. */
export function backgroundImageRect(background: GraphBackground, natural: Size): Rect {
  const width = background.imageWidth > 0 ? background.imageWidth : natural.width;
  const height = natural.width > 0 ? (width * natural.height) / natural.width : 0;
  return { x: background.imageX, y: background.imageY, width, height };
}

export interface ViewportTransform {
  pan: { x: number; y: number };
  zoom: number;
}

/**
 * Размер и смещение плиток текстуры на экране (для background-size/background-position):
 * плитки привязаны к точке (imageX, imageY) графа и масштабируются вместе с ним.
 */
export function tileScreenLayout(rect: Rect, viewport: ViewportTransform): Rect {
  return {
    x: viewport.pan.x + rect.x * viewport.zoom,
    y: viewport.pan.y + rect.y * viewport.zoom,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

/**
 * «Вписать в текущий вид»: положение и ширина картинки, при которых она целиком закрывает
 * видимую область графа (как background-size: cover) и стоит по её центру.
 */
export function coverVisibleArea(visible: Rect, natural: Size): { imageX: number; imageY: number; imageWidth: number } {
  if (natural.width <= 0 || natural.height <= 0) {
    return { imageX: visible.x, imageY: visible.y, imageWidth: visible.width };
  }
  const scale = Math.max(visible.width / natural.width, visible.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    imageX: visible.x + (visible.width - width) / 2,
    imageY: visible.y + (visible.height - height) / 2,
    imageWidth: width,
  };
}
