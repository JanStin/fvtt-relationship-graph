/**
 * Цвета областей фракций: разбор hex и смешение нескольких цветов в Oklab — перцептивно
 * равномерном пространстве, где середина между двумя цветами не уходит в грязно-серый.
 * Используется заливкой областей в режиме «смешение» (ui/faction-blobs.ts) и подбором цвета
 * кнопок под цвет панели инструментов (isLightColor). Здесь же — цвета новых фракций и типов
 * связей (distinctColors) и цвет названия фракции под её заливкой (watermarkColors).
 */

export type Rgb = [number, number, number];
export type Oklab = [number, number, number];

/** Цвет фракции, который не удалось разобрать. */
const FALLBACK_RGB: Rgb = [136, 136, 136];

/** "#rgb" / "#rrggbb" → [r, g, b] (0–255); другой формат — серый. */
export function parseHexColor(color: string): Rgb {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [...FALLBACK_RGB];
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const c = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/**
 * Светлый ли цвет — тёмный текст на нём контрастнее белого (относительная яркость WCAG выше
 * точки, где контраст с чёрным и белым равен). null — не "#rgb" / "#rrggbb".
 */
export function isLightColor(color: string): boolean | null {
  const hex = color.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const [r, g, b] = parseHexColor(color).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > LIGHT_LUMINANCE;
}

/** Контраст двух цветов по WCAG (1–21); цвета — "#rgb" / "#rrggbb". */
export function contrastRatio(a: string, b: string): number {
  const luminance = (color: string) => {
    const [r, g, b2] = parseHexColor(color).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Яркость, при которой контраст с чёрным и с белым одинаков: (L + 0.05)² = 1.05 · 0.05. */
const LIGHT_LUMINANCE = Math.sqrt(1.05 * 0.05) - 0.05;

/** sRGB (0–255) → Oklab. */
export function rgbToOklab([r8, g8, b8]: Rgb): Oklab {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Oklab → sRGB (0–255); цвет вне охвата sRGB обрезается по каналам. */
export function oklabToRgb([lightness, a, b]: Oklab): Rgb {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * Среднее цветов (в Oklab) с весами; веса ≤ 0 не учитываются. Нет ни одного веса больше нуля —
 * null. Цвета передаются уже в Oklab: заливка переводит цвет фракции один раз, а не в каждой клетке.
 */
export function mixOklab(colors: readonly Oklab[], weights: readonly number[]): Rgb | null {
  let total = 0;
  let lightness = 0;
  let a = 0;
  let b = 0;
  colors.forEach((color, i) => {
    const weight = weights[i] ?? 0;
    if (weight <= 0) return;
    total += weight;
    lightness += color[0] * weight;
    a += color[1] * weight;
    b += color[2] * weight;
  });
  return total > 0 ? oklabToRgb([lightness / total, a / total, b / total]) : null;
}

/** [r, g, b] (0–255) → "#rrggbb". */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Расстояние двух цветов в Oklab — насколько по-разному они выглядят. */
function oklabDistance(a: Oklab, b: Oklab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Сколько оттенков в наборе для новых фракций и типов связей. */
const DISTINCT_HUES = 16;
/** Насыщенность набора (Oklch): яркие, но не кислотные. */
const DISTINCT_CHROMA = 0.14;
/** Яркость набора: на тёмном фоне — светлее, на светлом — темнее, чтобы цвет не терялся. */
const DISTINCT_LIGHTNESS_ON_DARK = 0.72;
const DISTINCT_LIGHTNESS_ON_LIGHT = 0.55;

/** Оттенки одной яркости и насыщенности по кругу (Oklch), под фон графа. */
function distinctPalette(backdrop: string): string[] {
  const lightness = isLightColor(backdrop) ? DISTINCT_LIGHTNESS_ON_LIGHT : DISTINCT_LIGHTNESS_ON_DARK;
  return Array.from({ length: DISTINCT_HUES }, (_, i) => {
    const hue = ((i * 360) / DISTINCT_HUES + 25) * (Math.PI / 180);
    return rgbToHex(oklabToRgb([lightness, DISTINCT_CHROMA * Math.cos(hue), DISTINCT_CHROMA * Math.sin(hue)]));
  });
}

export interface DistinctColorOptions {
  /** Наименьший контраст с фоном (WCAG); 0 — не проверять. Не проходит ни один — весь набор. */
  minContrast?: number;
  /** Случайное число 0–1: с чего начать, когда занятых цветов нет. По умолчанию Math.random. */
  random?: () => number;
}

/**
 * Цвета для новой фракции или типа связи — от самого непохожего на занятые: каждый следующий
 * дальше всех (в Oklab) и от занятых, и от уже выбранных. Первый — цвет по умолчанию, остальные —
 * по кнопке «Другой цвет». Занятых нет — начало набора случайное.
 */
export function distinctColors(existing: readonly string[], backdrop: string, options: DistinctColorOptions = {}): string[] {
  const { minContrast = 0, random = Math.random } = options;
  const palette = distinctPalette(backdrop);
  const readable = palette.filter((color) => contrastRatio(color, backdrop) >= minContrast);
  const candidates = readable.length > 0 ? readable : palette;
  const taken = existing.filter((color) => isLightColor(color) !== null).map((color) => rgbToOklab(parseHexColor(color)));
  const start = taken.length === 0 ? Math.floor(random() * candidates.length) % candidates.length : 0;
  const pool = [...candidates.slice(start), ...candidates.slice(0, start)].map((color) => ({ color, lab: rgbToOklab(parseHexColor(color)) }));
  const result: string[] = [];
  while (pool.length > 0) {
    let best = 0;
    let bestDistance = -1;
    pool.forEach((candidate, i) => {
      const distance = taken.length === 0 ? Infinity : Math.min(...taken.map((lab) => oklabDistance(lab, candidate.lab)));
      if (distance > bestDistance) {
        best = i;
        bestDistance = distance;
      }
    });
    const [picked] = pool.splice(best, 1);
    result.push(picked.color);
    taken.push(picked.lab);
  }
  return result;
}

/** Контраст надписи-«водяного знака» с фоном под ней: крупный текст по WCAG. */
const WATERMARK_CONTRAST = 3;
/** Пределы непрозрачности надписи: прозрачнее — уже не прочесть, плотнее — не водяной знак. */
const WATERMARK_MIN_ALPHA = 0.45;
const WATERMARK_MAX_ALPHA = 0.85;
const WATERMARK_LIGHT = "#f8fafc";
const WATERMARK_DARK = "#0f172a";

/** Цвет поверх цвета с непрозрачностью alpha — так их смешивает канвас (в sRGB). */
function compositeRgb(under: Rgb, over: Rgb, alpha: number): Rgb {
  return under.map((c, i) => Math.round(c * (1 - alpha) + over[i] * alpha)) as Rgb;
}

export interface WatermarkColors {
  /** Цвет текста. */
  text: string;
  /** Непрозрачность текста. */
  alpha: number;
  /** Обводка противоположного тона — читается и на картинке фона, цвет которой неизвестен. */
  outline: string;
}

/**
 * Цвет названия фракции внутри её области: фон графа (backdrop) под заливкой fill с
 * непрозрачностью fillAlpha. Текст — светлый или тёмный, что контрастнее; непрозрачность —
 * наименьшая, при которой контраст не меньше 3:1 (в пределах WATERMARK_MIN/MAX_ALPHA).
 */
export function watermarkColors(backdrop: string, fill: string, fillAlpha: number): WatermarkColors {
  const under = compositeRgb(parseHexColor(backdrop), parseHexColor(fill), fillAlpha);
  const underHex = rgbToHex(under);
  const light = contrastRatio(WATERMARK_LIGHT, underHex) >= contrastRatio(WATERMARK_DARK, underHex);
  const text = light ? WATERMARK_LIGHT : WATERMARK_DARK;
  const textRgb = parseHexColor(text);
  let alpha = WATERMARK_MIN_ALPHA;
  while (alpha < WATERMARK_MAX_ALPHA && contrastRatio(rgbToHex(compositeRgb(under, textRgb, alpha)), underHex) < WATERMARK_CONTRAST) {
    alpha = Math.min(WATERMARK_MAX_ALPHA, alpha + 0.05);
  }
  return { text, alpha: Math.round(alpha * 100) / 100, outline: light ? WATERMARK_DARK : WATERMARK_LIGHT };
}
