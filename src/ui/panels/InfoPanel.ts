/**
 * Панель сведений (пункт «Информация» в меню ПКМ, двойной клик в режиме просмотра) — боковая
 * панель на месте панелей редактирования. Только чтение; содержимое — core/describe.ts.
 * Пока панель открыта, одиночный клик по другому элементу графа показывает его сведения
 * (решает GraphApp).
 */

import type { Description } from "../../core/describe";
import { panelHeader } from "./form";

export function createInfoPanel(description: Description, onClose: () => void): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel frg-info-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  if (description.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "frg-info-subtitle";
    subtitle.textContent = description.subtitle;
    body.append(subtitle);
  }

  for (const row of description.rows) {
    const block = document.createElement("div");
    block.className = "frg-field";
    const label = document.createElement("div");
    label.className = "frg-field-label";
    label.textContent = row.label;
    const value = document.createElement("div");
    value.className = "frg-info-value";
    value.textContent = row.value;
    block.append(label, value);
    body.append(block);
  }

  element.append(panelHeader(description.title, onClose), body);
  return element;
}
