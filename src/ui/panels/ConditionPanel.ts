/**
 * Панели справочника состояний (только GM): список и форма одного состояния.
 * Устроены как панели фракций (FactionPanel.ts): только DOM, логика — core/conditions.ts.
 * Встроенные состояния показаны в списке, но не редактируются.
 */

import { conditionIconClass, isBuiltinCondition, type ConditionEditValues } from "../../core/conditions";
import type { ConditionDef } from "../../core/model";
import { createPanelShell, field, hint, panelHeader, textInput } from "./form";

export interface ConditionListCallbacks {
  onEdit(conditionId: string): void;
  onCreate(): void;
  onClose(): void;
}

function iconElement(icon: string): HTMLElement {
  const i = document.createElement("i");
  i.className = `${conditionIconClass(icon)} frg-condition-icon`;
  return i;
}

export function createConditionListPanel(
  conditions: readonly ConditionDef[],
  /** Сколько узлов имеют это состояние. */
  usageCount: (conditionId: string) => number,
  callbacks: ConditionListCallbacks,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  for (const condition of conditions) {
    const builtin = isBuiltinCondition(condition.id);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "frg-faction-row";
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = condition.label;
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(usageCount(condition.id));
    count.title = "Узлов с этим состоянием";
    row.append(iconElement(condition.icon), name, count);
    if (builtin) {
      row.disabled = true;
      row.title = "Встроенное состояние — не редактируется";
    } else {
      row.addEventListener("click", () => callbacks.onEdit(condition.id));
    }
    body.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "frg-panel-footer";
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "Создать состояние";
  create.addEventListener("click", () => callbacks.onCreate());
  footer.append(create);

  element.append(panelHeader("Состояния", callbacks.onClose), body, footer);
  return element;
}

export interface ConditionPanelCallbacks {
  onSave(values: ConditionEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/** condition === null — создание нового состояния (без кнопки удаления). */
export function createConditionPanel(condition: ConditionDef | null, callbacks: ConditionPanelCallbacks): HTMLElement {
  const label = textInput(condition?.label ?? "");
  const icon = textInput(condition?.icon ?? "");
  icon.placeholder = "fa-skull";

  // Живой предпросмотр: Font Awesome в Foundry уже подключён, достаточно выставить классы.
  const preview = document.createElement("span");
  preview.className = "frg-condition-preview";
  const renderPreview = () => preview.replaceChildren(iconElement(icon.value));
  icon.addEventListener("input", renderPreview);
  renderPreview();
  const iconRow = document.createElement("div");
  iconRow.className = "frg-field-row";
  iconRow.append(icon, preview);

  const shell = createPanelShell(condition ? "Состояние" : "Новое состояние", condition ? "Удалить состояние" : null, {
    onSave: () => callbacks.onSave({ label: label.value, icon: icon.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(
    field("Название", label),
    field("Иконка (класс Font Awesome)", iconRow),
    hint("Например fa-skull, fa-heart, fa-crown. Пустое поле — иконка по умолчанию."),
  );
  return shell.element;
}
