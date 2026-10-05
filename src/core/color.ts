/**
 * Цвета областей фракций: разбор hex и смешение нескольких цветов в Oklab — перцептивно
 * равномерном пространстве, где середина между двумя цветами не уходит в грязно-серый.
 * Используется заливкой областей в режиме «смешение» (ui/faction-blobs.ts).
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
