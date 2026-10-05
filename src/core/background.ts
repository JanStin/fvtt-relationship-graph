/**
 * Фон графа: применение значений формы (panels/BackgroundPanel.ts) и геометрия картинки
 * в координатах графа. Чистая логика — отрисовку делает ui/background-layer.ts.
 *
 * Картинка лежит в координатах графа (как карта): при панорамировании и зуме она двигается
 * и масштабируется вместе с узлами. Текстура — та же картинка плитками от точки привязки.
 * Режим «на весь экран» — исключение: картинка закрывает область графа (как CSS cover) и стоит
 * на месте, геометрия ей не нужна.
 */

import type { BackgroundImageMode, FactionBlend, FactionDisplay, GraphBackground, GraphData } from "./model";

/** Стандартный цвет фона графа (без настроек). */
export const DEFAULT_BACKGROUND_COLOR = "#16213e";
const MIN_OPACITY = 0.05;
/** Меньше — плитки текстуры превращаются в рябь, а браузер — в печку. */
const MIN_IMAGE_WIDTH = 16;

export const BACKGROUND_IMAGE_MODES: readonly BackgroundImageMode[] = ["tile", "single", "screen"];

export const FACTION_DISPLAYS: readonly FactionDisplay[] = ["badges", "areas"];
export const FACTION_BLENDS: readonly FactionBlend[] = ["overlay", "mix"];

/** Шрифт подписей по умолчанию — шрифт интерфейса Foundry. */
export const DEFAULT_GRAPH_FONT = "Signika";

/**
 * Системные шрифты для выбора в «Фон графа» (вместе со шрифтами Foundry). Их может не оказаться
 * у игрока (Segoe UI нет на Mac) — тогда браузер возьмёт запасной из graphFontFamily.
 */
export const SYSTEM_FONTS: readonly string[] = [
  "Segoe UI",
  "Tahoma",
  "Arial",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Palatino Linotype",
  "Garamond",
  "Courier New",
];

export function defaultBackground(): GraphBackground {
  return {
    color: "",
    image: "",
    imageMode: "single",
    imageX: 0,
    imageY: 0,
    imageWidth: 0,
    imageOpacity: 1,
    font: "",
    factionDisplay: "badges",
    factionBlend: "overlay",
  };
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
  /** '' — шрифт по умолчанию. */
  font: string;
  factionDisplay: FactionDisplay;
  factionBlend: FactionBlend;
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
    font: values.font.trim(),
    factionDisplay: parseFactionDisplay(values.factionDisplay),
    factionBlend: parseFactionBlend(values.factionBlend),
  };
}

/** Неизвестное значение (или его нет) — "badges". */
export function parseFactionDisplay(value: unknown): FactionDisplay {
  return FACTION_DISPLAYS.includes(value as FactionDisplay) ? (value as FactionDisplay) : "badges";
}

/** Неизвестное значение (или его нет) — "overlay". */
export function parseFactionBlend(value: unknown): FactionBlend {
  return FACTION_BLENDS.includes(value as FactionBlend) ? (value as FactionBlend) : "overlay";
}

/** Как красить перекрытие областей фракций. */
export function factionBlendOf(background: GraphBackground | null | undefined): FactionBlend {
  return parseFactionBlend(background?.factionBlend);
}

/**
 * Как на самом деле красить перекрытие: при ромбиках настройка в панели скрыта — и не действует,
 * области основных фракций лежат слоями, как до 1.2.1. Сохранённое значение при этом не теряется.
 */
export function appliedFactionBlend(background: GraphBackground | null | undefined): FactionBlend {
  return factionDisplayOf(background) === "areas" ? factionBlendOf(background) : "overlay";
}

/** Как показывать дополнительные фракции узлов графа. */
export function factionDisplayOf(background: GraphBackground | null | undefined): FactionDisplay {
  return parseFactionDisplay(background?.factionDisplay);
}

/** Фон без цвета, картинки, своего шрифта и с видом фракций по умолчанию ничем не отличается от стандартного. */
export function isDefaultBackground(background: GraphBackground): boolean {
  return (
    background.color === "" &&
    background.image === "" &&
    !background.font &&
    factionDisplayOf(background) === "badges" &&
    factionBlendOf(background) === "overlay"
  );
}

/** Задаёт фон графа; стандартный фон хранится как null (см. GraphData.background). */
export function setBackground(data: GraphData, background: GraphBackground | null): GraphData {
  return { ...data, background: background && !isDefaultBackground(background) ? background : null };
}

/** Цвет, которым заливается фон графа. */
export function backgroundColor(background: GraphBackground | null | undefined): string {
  return background?.color || DEFAULT_BACKGROUND_COLOR;
}

/**
 * CSS font-family подписей (и для HTML-слоя, и для Cytoscape): выбранный шрифт, за ним Signika
 * и общий sans-serif — на случай, если выбранного шрифта у зрителя нет.
 */
export function graphFontFamily(background: GraphBackground | null | undefined): string {
  const font = background?.font?.trim() ?? "";
  const fallback = `"${DEFAULT_GRAPH_FONT}", sans-serif`;
  return font && font !== DEFAULT_GRAPH_FONT ? `"${font.replace(/"/g, "")}", ${fallback}` : fallback;
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
