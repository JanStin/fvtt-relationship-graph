/**
 * Цвета интерфейса окна графа (панели, меню, ползунок масштаба, панель инструментов): готовые
 * наборы и свой цвет панели инструментов. Результат — CSS-переменные --frg-* (styles/module.css),
 * которые GraphApp ставит inline на окно графа и окна сведений: inline перебивает и тему Foundry.
 * Стандартный набор без своего цвета — пусто, действуют цвета темы Foundry из module.css.
 * Чистая логика, без DOM.
 */

import { contrastRatio, isLightColor, parseHexColor } from "./color";

export const UI_THEMES = ["", "parchment", "frost", "night", "forest", "ash", "crimson", "abyss"] as const;
/** '' — стандартный: цвета темы Foundry (тёмной или светлой). */
export type UiTheme = (typeof UI_THEMES)[number];

/** Неизвестное значение (или его нет) — стандартный набор. */
export function parseUiTheme(value: unknown): UiTheme {
  return UI_THEMES.includes(value as UiTheme) ? (value as UiTheme) : "";
}

interface Palette {
  surface: string;
  surfaceRaised: string;
  hover: string;
  borderSubtle: string;
  border: string;
  borderStrong: string;
  text: string;
  textStrong: string;
  textMuted: string;
  accent: string;
  accentText: string;
  danger: string;
  focus: string;
  conditionIcon: string;
  shadow: string;
}

const PRESETS: Record<Exclude<UiTheme, "">, Palette> = {
  // светлый тёплый: бумага, чернила, ржавый акцент
  parchment: {
    surface: "#efe4c8",
    surfaceRaised: "#f8f1df",
    hover: "#e2d4b0",
    borderSubtle: "#d6c49c",
    border: "#94794f",
    borderStrong: "#6f5a38",
    text: "#3b2f1e",
    textStrong: "#24190c",
    textMuted: "#6b5a40",
    accent: "#b45309",
    accentText: "#fff7ed",
    danger: "#a51b1b",
    focus: "#9a3412",
    conditionIcon: "#92400e",
    shadow: "rgba(59, 47, 30, 0.3)",
  },
  // тёмный сине-фиолетовый
  night: {
    surface: "#161a2e",
    surfaceRaised: "#20253f",
    hover: "#2c3254",
    borderSubtle: "#2c3254",
    border: "#5f689c",
    borderStrong: "#7a84bb",
    text: "#e0e4ff",
    textStrong: "#f5f6ff",
    textMuted: "#9aa1cc",
    accent: "#a78bfa",
    accentText: "#161a2e",
    danger: "#fca5a5",
    focus: "#818cf8",
    conditionIcon: "#c4b5fd",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  // тёмный зелёный
  forest: {
    surface: "#12201a",
    surfaceRaised: "#1b2e25",
    hover: "#264034",
    borderSubtle: "#264034",
    border: "#5a8470",
    borderStrong: "#74a08a",
    text: "#e3efe7",
    textStrong: "#f4faf6",
    textMuted: "#9bb8a8",
    accent: "#a3e635",
    accentText: "#12201a",
    danger: "#fca5a5",
    focus: "#4ade80",
    conditionIcon: "#bef264",
    shadow: "rgba(0, 0, 0, 0.5)",
  },
  // светлый холодный: иней, сталь, синий акцент
  frost: {
    surface: "#e8eef5",
    surfaceRaised: "#f6f9fc",
    hover: "#d6e0eb",
    borderSubtle: "#c5d2e0",
    border: "#7088a3",
    borderStrong: "#546d88",
    text: "#1e2a3a",
    textStrong: "#0f172a",
    textMuted: "#4a5d73",
    accent: "#0369a1",
    accentText: "#f0f9ff",
    danger: "#b91c1c",
    focus: "#1d4ed8",
    conditionIcon: "#0e7490",
    shadow: "rgba(30, 42, 58, 0.25)",
  },
  // тёмный нейтральный графит — без оттенка, к любой карте
  ash: {
    surface: "#1c1c1f",
    surfaceRaised: "#26262a",
    hover: "#333338",
    borderSubtle: "#333338",
    border: "#6b6b73",
    borderStrong: "#85858e",
    text: "#e4e4e7",
    textStrong: "#fafafa",
    textMuted: "#a1a1aa",
    accent: "#f59e0b",
    accentText: "#1c1c1f",
    danger: "#fca5a5",
    focus: "#60a5fa",
    conditionIcon: "#fcd34d",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  // тёмный винный с золотым акцентом
  crimson: {
    surface: "#1f1114",
    surfaceRaised: "#2b171c",
    hover: "#3a1f26",
    borderSubtle: "#3a1f26",
    border: "#965a66",
    borderStrong: "#a66573",
    text: "#f3e1e4",
    textStrong: "#fdf3f5",
    textMuted: "#c49aa3",
    accent: "#e8b04b",
    accentText: "#1f1114",
    danger: "#fecaca",
    focus: "#fb7185",
    conditionIcon: "#f0c674",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
  // тёмный сине-бирюзовый: море, глубина
  abyss: {
    surface: "#0e1e26",
    surfaceRaised: "#142a35",
    hover: "#1c3745",
    borderSubtle: "#1c3745",
    border: "#4f7f8f",
    borderStrong: "#6a9aaa",
    text: "#dcf0f5",
    textStrong: "#f2fbfd",
    textMuted: "#8fb5c0",
    accent: "#2dd4bf",
    accentText: "#0e1e26",
    danger: "#fca5a5",
    focus: "#38bdf8",
    conditionIcon: "#5eead4",
    shadow: "rgba(0, 0, 0, 0.55)",
  },
};

const VAR_NAMES: Record<keyof Palette, string> = {
  surface: "--frg-surface",
  surfaceRaised: "--frg-surface-raised",
  hover: "--frg-hover",
  borderSubtle: "--frg-border-subtle",
  border: "--frg-border",
  borderStrong: "--frg-border-strong",
  text: "--frg-text",
  textStrong: "--frg-text-strong",
  textMuted: "--frg-text-muted",
  accent: "--frg-accent",
  accentText: "--frg-accent-text",
  danger: "--frg-danger",
  focus: "--frg-focus",
  conditionIcon: "--frg-condition-icon",
  shadow: "--frg-shadow",
};

/** Все переменные, которые может поставить uiThemeVars, — чтобы снять прежние при смене набора. */
export const UI_THEME_VARS: readonly string[] = [...Object.values(VAR_NAMES), "--frg-toolbar-bg"];

function hex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

/** Смесь цвета с другим в доле amount (0 — color, 1 — other), в sRGB. */
export function mixHex(color: string, other: string, amount: number): string {
  const a = parseHexColor(color);
  const b = parseHexColor(other);
  return `#${a.map((c, i) => hex(c + (b[i] - c) * amount)).join("")}`;
}

/** Контраст по WCAG: текст — 4.5, рамка поля и значимые элементы — 3. */
const TEXT_CONTRAST = 4.5;
const BORDER_CONTRAST = 3;
/** Подсветка при наведении — заметно, но не так резко, как рамка. */
const HOVER_CONTRAST = 1.25;

/**
 * Наименьшая доля смеси from → to (шаг 1/64), при которой контраст с background не ниже min;
 * не достигается — 1 (цвет to).
 */
function mixUntil(from: string, to: string, background: string | readonly string[], min: number): string {
  const backgrounds = typeof background === "string" ? [background] : background;
  for (let step = 0; step <= 64; step++) {
    const color = mixHex(from, to, step / 64);
    if (backgrounds.every((b) => contrastRatio(color, b) >= min)) return color;
  }
  return mixHex(from, to, 1);
}

/**
 * Фон, рамки и текст от своего цвета. Оттенки подбираются под контраст WCAG, а не долей смеси:
 * на цветах средней яркости фиксированная доля давала нечитаемый текст и невидимые рамки.
 * Текст — самый мягкий из вариантов, что ещё читается; приглушённый — как можно ближе к фону,
 * но не ниже 4.5:1 и на фоне, и на подсветке.
 */
function fromColor(color: string, light: boolean, preset: Palette | null): Partial<Palette> {
  const extreme = light ? "#000000" : "#ffffff";
  // Подсветка — к тексту; на цветах средней яркости так текст на ней не читался бы — тогда в
  // другую сторону (темнее тёмного фона, светлее светлого). Текст подбирается и по фону, и по ней.
  const towardText = mixUntil(color, extreme, color, HOVER_CONTRAST);
  const hover =
    contrastRatio(extreme, towardText) >= TEXT_CONTRAST
      ? towardText
      : mixUntil(color, light ? "#ffffff" : "#000000", color, HOVER_CONTRAST);
  const text = mixUntil(light ? "#1e293b" : "#e2e8f0", extreme, [color, hover], TEXT_CONTRAST);
  const textStrong = mixUntil(light ? "#0f172a" : "#f8fafc", extreme, [color, hover], TEXT_CONTRAST);
  return {
    surface: color,
    surfaceRaised: mixHex(color, light ? "#ffffff" : text, light ? 0.45 : 0.08),
    hover,
    borderSubtle: mixUntil(color, text, color, 1.5),
    border: mixUntil(color, text, color, BORDER_CONTRAST),
    borderStrong: mixUntil(color, text, color, BORDER_CONTRAST + 0.8),
    text,
    textStrong,
    // от фона к тексту — первый оттенок, что читается и на фоне, и на подсветке строки
    textMuted: mixUntil(color, text, [color, hover], TEXT_CONTRAST),
    // акценты — от набора (или стандартные для светлого/тёмного фона), если видны на этом цвете
    ...signalColors(color, light, text, preset),
  };
}

/** Первый из цветов с контрастом к фону не ниже min; ни один не подходит — fallback. */
function firstVisible(candidates: readonly (string | undefined)[], background: string, min: number, fallback: string): string {
  return candidates.find((c) => c !== undefined && contrastRatio(c, background) >= min) ?? fallback;
}

/** Акцент, фокус, ошибка, значки состояний на своём цвете: набора, стандартные или цвет текста. */
function signalColors(color: string, light: boolean, text: string, preset: Palette | null): Partial<Palette> {
  const accent = firstVisible([preset?.accent, light ? "#b45309" : "#facc15"], color, BORDER_CONTRAST, text);
  return {
    accent,
    accentText: contrastRatio("#000000", accent) >= contrastRatio("#ffffff", accent) ? "#000000" : "#ffffff",
    focus: firstVisible([preset?.focus, light ? "#2563eb" : "#60a5fa"], color, BORDER_CONTRAST, text),
    danger: firstVisible([preset?.danger, light ? "#b91c1c" : "#fca5a5"], color, TEXT_CONTRAST, text),
    conditionIcon: firstVisible([preset?.conditionIcon, light ? "#b45309" : "#fde68a"], color, BORDER_CONTRAST, text),
  };
}

/**
 * CSS-переменные интерфейса: набор, поверх него — свой цвет панели инструментов (фон, рамки,
 * текст боковых панелей и меню берутся от него; акцент и фокус — от набора, если на этом цвете
 * они видны). Боковые
 * панели всегда того же цвета, что панель инструментов (--frg-toolbar-bg = --frg-surface).
 * Пустой объект — стандартный набор без своего цвета.
 */
export function uiThemeVars(theme: UiTheme, toolbarColor: string): Record<string, string> {
  const palette: Partial<Palette> = theme ? { ...PRESETS[theme] } : {};
  const light = toolbarColor.trim() ? isLightColor(toolbarColor) : null;
  if (light !== null) Object.assign(palette, fromColor(toolbarColor.trim(), light, theme ? PRESETS[theme] : null));

  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(palette)) vars[VAR_NAMES[key as keyof Palette]] = value;
  if (palette.surface) vars["--frg-toolbar-bg"] = palette.surface;
  return vars;
}

/** Цвет панели инструментов набора; стандартный — null (зависит от темы Foundry). */
export function uiThemeToolbarColor(theme: UiTheme): string | null {
  return theme ? PRESETS[theme].surface : null;
}

/** Светлый ли фон интерфейса при этом наборе и цвете — под него цвет кнопок панели инструментов. */
export function isLightUi(theme: UiTheme, toolbarColor: string): boolean | null {
  const light = toolbarColor.trim() ? isLightColor(toolbarColor) : null;
  if (light !== null) return light;
  return theme ? isLightColor(PRESETS[theme].surface) : null;
}
