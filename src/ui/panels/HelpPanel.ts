/**
 * Шпаргалка управления (кнопка «?» на панели инструментов): мышь и клавиатура — короткая
 * выжимка docs/controls.md. Только чтение, без формы.
 */

import { t } from "../../core/i18n";
import { hint, panelHeader } from "./form";

/** Строки шпаргалки: ключи RELGRAPH.Help.<раздел>.<строка>.Keys / .Text. */
const MOUSE_ROWS = [
  "Wheel",
  "MiddleDrag",
  "Click",
  "DragEmpty",
  "ShiftClick",
  "ShiftDrag",
  "CtrlDrag",
  "AltClickArea",
  "AltWheel",
  "SClick",
  "DoubleClick",
  "RightClick",
] as const;

const KEYBOARD_ROWS = ["Esc", "Delete", "Undo", "Redo", "Find"] as const;

function section(title: string, group: "Mouse" | "Keyboard", rows: readonly string[]): HTMLElement[] {
  const heading = document.createElement("div");
  heading.className = "frg-field-label";
  heading.textContent = title;
  const list = document.createElement("dl");
  list.className = "frg-help-list";
  for (const row of rows) {
    const keys = document.createElement("dt");
    const kbd = document.createElement("kbd");
    kbd.textContent = t(`RELGRAPH.Help.${group}.${row}.Keys`);
    keys.append(kbd);
    const text = document.createElement("dd");
    text.textContent = t(`RELGRAPH.Help.${group}.${row}.Text`);
    list.append(keys, text);
  }
  return [heading, list];
}

export function createHelpPanel(onClose: () => void): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";
  body.append(
    ...section(t("RELGRAPH.Help.Mouse.Title"), "Mouse", MOUSE_ROWS),
    ...section(t("RELGRAPH.Help.Keyboard.Title"), "Keyboard", KEYBOARD_ROWS),
    hint(t("RELGRAPH.Help.EditOnly")),
  );

  element.append(panelHeader(t("RELGRAPH.Help.Panel"), onClose), body);
  return element;
}
