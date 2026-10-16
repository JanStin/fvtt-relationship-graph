/**
 * Настройки панели сведений у этого клиента: свёрнутые блоки — в localStorage (ширина — общая
 * у всех боковых панелей, panel-width.ts).
 * Хранилище может быть недоступно (приватное окно, запрет сайта) — тогда чтение даёт значения
 * по умолчанию, а запись молча пропускается.
 */

import { MODULE_ID } from "../../foundry/settings";

const COLLAPSED_KEY = `${MODULE_ID}.infoPanelCollapsed`;

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
