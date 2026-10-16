/**
 * Настройки панели сведений у этого клиента: ширина и свёрнутые блоки — в localStorage.
 * Хранилище может быть недоступно (приватное окно, запрет сайта) — тогда чтение даёт значения
 * по умолчанию, а запись молча пропускается.
 */

import { MODULE_ID } from "../../foundry/settings";

const WIDTH_KEY = `${MODULE_ID}.infoPanelWidth`;
const COLLAPSED_KEY = `${MODULE_ID}.infoPanelCollapsed`;

export const INFO_PANEL_DEFAULT_WIDTH = 380;
export const INFO_PANEL_MIN_WIDTH = 280;
/** Доля окна графа, больше которой панель не растёт, — граф должен оставаться видимым. */
export const INFO_PANEL_MAX_SHARE = 0.6;

function read(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // нет хранилища — настройка живёт до перезагрузки
  }
}

/**
 * Ширина в допустимых пределах: не уже INFO_PANEL_MIN_WIDTH и не шире доли окна графа.
 * В очень узком окне верхняя граница важнее нижней.
 */
export function clampInfoPanelWidth(width: number, hostWidth: number): number {
  const max = Math.max(0, hostWidth * INFO_PANEL_MAX_SHARE);
  return Math.round(Math.min(Math.max(width, INFO_PANEL_MIN_WIDTH), max));
}

/** Сохранённая ширина; нет или испорчена — по умолчанию. Пределы окна применяет CSS (max-width). */
export function loadInfoPanelWidth(): number {
  const width = Number(read(WIDTH_KEY));
  return Number.isFinite(width) && width >= INFO_PANEL_MIN_WIDTH ? width : INFO_PANEL_DEFAULT_WIDTH;
}

export function saveInfoPanelWidth(width: number): void {
  write(WIDTH_KEY, String(Math.round(width)));
}

/** id свёрнутых блоков (DescriptionBlock.id). */
export function loadCollapsedBlocks(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(read(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function setBlockCollapsed(id: string, collapsed: boolean): void {
  const ids = loadCollapsedBlocks();
  if (collapsed) ids.add(id);
  else ids.delete(id);
  write(COLLAPSED_KEY, JSON.stringify([...ids]));
}
