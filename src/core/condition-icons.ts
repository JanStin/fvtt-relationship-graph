/**
 * Готовый набор иконок для состояний (сетка выбора в panels/icon-picker.ts): 68 иконок Font
 * Awesome по группам. Только имена, которые есть и в Font Awesome 6 (Foundry 13), и в 7
 * (Foundry 14). Остальные тысячи иконок Font Awesome в Foundry тоже есть — их класс вписывают
 * в поле «Своя иконка». Названия групп и иконок — RELGRAPH.Condition.IconGroup.<id> и
 * RELGRAPH.Condition.IconName.<имя без fa->.
 */

import { conditionIconClass } from "./conditions";

export interface ConditionIconGroup {
  id: string;
  /** Классы без стиля: "fa-skull". */
  icons: readonly string[];
}

export const CONDITION_ICON_GROUPS: readonly ConditionIconGroup[] = [
  {
    id: "health",
    icons: [
      "fa-skull",
      "fa-skull-crossbones",
      "fa-heart-crack",
      "fa-heart-pulse",
      "fa-droplet",
      "fa-bandage",
      "fa-syringe",
      "fa-bed",
      "fa-face-dizzy",
      "fa-biohazard",
      "fa-virus",
    ],
  },
  {
    id: "captivity",
    icons: ["fa-link", "fa-lock", "fa-handcuffs", "fa-user-lock", "fa-dungeon", "fa-scale-balanced", "fa-gavel", "fa-ban"],
  },
  {
    id: "magic",
    icons: [
      "fa-wand-magic-sparkles",
      "fa-hat-wizard",
      "fa-hand-sparkles",
      "fa-book-skull",
      "fa-ghost",
      "fa-spider",
      "fa-dragon",
      "fa-moon",
      "fa-fire",
      "fa-bolt",
      "fa-snowflake",
      "fa-eye",
    ],
  },
  {
    id: "quests",
    icons: [
      "fa-circle-exclamation",
      "fa-circle-question",
      "fa-scroll",
      "fa-key",
      "fa-magnifying-glass",
      "fa-puzzle-piece",
      "fa-envelope",
      "fa-hourglass-half",
      "fa-mask",
      "fa-user-secret",
      "fa-eye-slash",
    ],
  },
  {
    id: "attitude",
    icons: [
      "fa-heart",
      "fa-handshake",
      "fa-dove",
      "fa-face-smile",
      "fa-face-angry",
      "fa-thumbs-up",
      "fa-thumbs-down",
      "fa-hand-fist",
      "fa-user-shield",
      "fa-star",
    ],
  },
  {
    id: "status",
    icons: ["fa-crown", "fa-chess-king", "fa-landmark", "fa-coins", "fa-gem", "fa-shield-halved", "fa-medal", "fa-trophy", "fa-flag", "fa-tag"],
  },
  {
    id: "travel",
    icons: ["fa-person-walking", "fa-location-dot", "fa-map", "fa-compass", "fa-ship", "fa-anchor"],
  },
];

/** Та же ли иконка: "fa-skull" и "fa-solid fa-skull" — одна. */
export function sameConditionIcon(a: string, b: string): boolean {
  return conditionIconClass(a) === conditionIconClass(b);
}

/** Есть ли иконка в готовом наборе (иначе она «своя» — из поля класса). */
export function isCatalogConditionIcon(icon: string): boolean {
  return CONDITION_ICON_GROUPS.some((group) => group.icons.some((name) => sameConditionIcon(name, icon)));
}

/** Ключ названия иконки набора: "fa-skull-crossbones" → RELGRAPH.Condition.IconName.skull-crossbones. */
export function conditionIconNameKey(icon: string): string {
  return `RELGRAPH.Condition.IconName.${icon.replace(/^fa-/, "")}`;
}
