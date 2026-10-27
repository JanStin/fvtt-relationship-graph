/**
 * Выбор иконки состояния: сетка готового набора (core/condition-icons.ts) по группам и, под ней,
 * свёрнутое поле «Своя иконка» — класс Font Awesome для иконок не из набора (в том числе из FANG).
 * Значение одно — текст поля класса; клик по иконке сетки пишет в него её класс.
 *
 * Клавиатура: в сетку попадает одна кнопка (текущая иконка или первая), стрелки ходят по сетке,
 * Home / End — к первой и последней, Enter / пробел выбирают.
 */

import { conditionIconClass } from "../../core/conditions";
import { CONDITION_ICON_GROUPS, conditionIconNameKey, isCatalogConditionIcon, sameConditionIcon } from "../../core/condition-icons";
import { t } from "../../core/i18n";
import { hint, nextId, textInput } from "./form";

/** Где искать остальные иконки Font Awesome. */
const FONT_AWESOME_SEARCH_URL = "https://fontawesome.com/search";

export interface IconPicker {
  element: HTMLElement;
  value(): string;
}

function iconElement(icon: string, className: string): HTMLElement {
  const i = document.createElement("i");
  i.className = `${conditionIconClass(icon)} ${className}`;
  i.setAttribute("aria-hidden", "true");
  return i;
}

/** Ближайшая по горизонтали кнопка в ближайшем ряду выше (direction = -1) или ниже (1). */
function verticalNeighbour(buttons: readonly HTMLButtonElement[], from: HTMLButtonElement, direction: 1 | -1): HTMLButtonElement | null {
  const origin = from.getBoundingClientRect();
  const x = origin.left + origin.width / 2;
  let best: HTMLButtonElement | null = null;
  let bestRow = Infinity;
  let bestDx = Infinity;
  for (const button of buttons) {
    const rect = button.getBoundingClientRect();
    const dy = (rect.top - origin.top) * direction;
    // соседний ряд — хотя бы на полкнопки ниже (выше)
    if (dy < origin.height / 2) continue;
    const dx = Math.abs(rect.left + rect.width / 2 - x);
    if (dy < bestRow - 1 || (Math.abs(dy - bestRow) <= 1 && dx < bestDx)) {
      best = button;
      bestRow = dy;
      bestDx = dx;
    }
  }
  return best;
}

export function createIconPicker(current: string): IconPicker {
  const element = document.createElement("div");
  element.className = "frg-icon-picker";

  const custom = textInput(current, "fa-skull");
  const buttons: HTMLButtonElement[] = [];
  const iconOf = new Map<HTMLButtonElement, string>();

  for (const group of CONDITION_ICON_GROUPS) {
    const section = document.createElement("div");
    section.className = "frg-icon-group";
    section.setAttribute("role", "group");
    const caption = document.createElement("div");
    caption.className = "frg-icon-group-label";
    caption.id = nextId("frg-icon-group");
    caption.textContent = t(`RELGRAPH.Condition.IconGroup.${group.id}`);
    section.setAttribute("aria-labelledby", caption.id);
    const grid = document.createElement("div");
    grid.className = "frg-icon-grid";
    for (const icon of group.icons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "frg-icon-choice";
      const name = t(conditionIconNameKey(icon));
      button.title = name;
      button.setAttribute("aria-label", name);
      button.append(iconElement(icon, "frg-icon-choice-glyph"));
      button.addEventListener("click", () => {
        custom.value = icon;
        custom.dispatchEvent(new Event("input", { bubbles: true }));
      });
      buttons.push(button);
      iconOf.set(button, icon);
      grid.append(button);
    }
    section.append(caption, grid);
    element.append(section);
  }

  // своя иконка: свёрнута, если текущая есть в наборе
  const details = document.createElement("details");
  details.className = "frg-icon-custom";
  const summary = document.createElement("summary");
  summary.textContent = t("RELGRAPH.Condition.IconCustom");
  const preview = document.createElement("span");
  preview.className = "frg-condition-preview";
  const row = document.createElement("div");
  row.className = "frg-field-row";
  row.append(custom, preview);
  custom.setAttribute("aria-label", t("RELGRAPH.Condition.IconCustom"));
  const more = hint(t("RELGRAPH.Condition.IconMore"));
  const link = document.createElement("a");
  link.href = FONT_AWESOME_SEARCH_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "fontawesome.com";
  more.append(" ", link);
  const example = hint(t("RELGRAPH.Condition.IconHint"));
  more.id = nextId("frg-hint");
  example.id = nextId("frg-hint");
  custom.setAttribute("aria-describedby", `${example.id} ${more.id}`);
  details.append(summary, row, example, more);
  details.open = current.trim() !== "" && !isCatalogConditionIcon(current);
  element.append(details);

  /** Отметка текущей: рамка и галочка (не только цвет), aria-pressed; в Tab — она. */
  const sync = () => {
    const value = custom.value;
    preview.replaceChildren(iconElement(value, "frg-condition-icon"));
    let focusable: HTMLButtonElement | null = null;
    for (const button of buttons) {
      const selected = sameConditionIcon(iconOf.get(button) ?? "", value);
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("frg-icon-choice-current", selected);
      button.querySelector(".frg-icon-choice-check")?.remove();
      if (selected) {
        const check = document.createElement("i");
        check.className = "fa-solid fa-check frg-icon-choice-check";
        check.setAttribute("aria-hidden", "true");
        button.append(check);
        focusable ??= button;
      }
    }
    // кто в фокусе — тот и остаётся в Tab, чтобы фокус не прыгал
    const active = buttons.find((button) => button === button.ownerDocument.activeElement);
    const tabStop = active ?? focusable ?? buttons[0];
    for (const button of buttons) button.tabIndex = button === tabStop ? 0 : -1;
  };
  custom.addEventListener("input", sync);
  sync();

  element.addEventListener("keydown", (event) => {
    const from = event.target;
    if (!(from instanceof HTMLButtonElement) || !iconOf.has(from)) return;
    const index = buttons.indexOf(from);
    let next: HTMLButtonElement | null | undefined = null;
    if (event.key === "ArrowRight") next = buttons[index + 1];
    else if (event.key === "ArrowLeft") next = buttons[index - 1];
    else if (event.key === "ArrowDown") next = verticalNeighbour(buttons, from, 1) ?? buttons[index + 1];
    else if (event.key === "ArrowUp") next = verticalNeighbour(buttons, from, -1) ?? buttons[index - 1];
    else if (event.key === "Home") next = buttons[0];
    else if (event.key === "End") next = buttons[buttons.length - 1];
    else return;
    event.preventDefault();
    if (!next) return;
    for (const button of buttons) button.tabIndex = button === next ? 0 : -1;
    next.focus();
  });

  return { element, value: () => custom.value };
}
