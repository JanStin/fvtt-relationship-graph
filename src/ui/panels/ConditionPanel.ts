/**
 * Панели справочника состояний: список и форма одного состояния. Правит только GM, игрок
 * видит список только для чтения.
 * Устроены как панели фракций (FactionPanel.ts): только DOM, логика — core/conditions.ts.
 * Встроенные состояния показаны в списке, но не редактируются.
 */

import { conditionIconClass, conditionLabel, isBuiltinCondition, isDefaultConditionLabel, type ConditionEditValues } from "../../core/conditions";
import { t } from "../../core/i18n";
import type { ConditionDef } from "../../core/model";
import { createPanelShell, field, group, panelHeader, catalogReorder, textInput } from "./form";
import { createIconPicker } from "./icon-picker";

export interface ConditionListCallbacks {
  onEdit(conditionId: string): void;
  onCreate(): void;
  /**
   * Стрелка ↑/↓ или перетаскивание строки (только при editable); index — её новое место.
   * Встроенные двигаются наравне со своими.
   */
  onMove(conditionId: string, index: number): void;
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
  /** false — список только для чтения: у игрока и в режиме просмотра. */
  options: { editable: boolean },
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  const reorderRow = options.editable ? catalogReorder(conditions.length, (id, index) => callbacks.onMove(id, index)) : null;
  conditions.forEach((condition, index) => {
    // у игрока строка — просто текст, без клика
    const row = document.createElement(options.editable ? "button" : "div");
    row.className = "frg-faction-row";
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = conditionLabel(condition);
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(usageCount(condition.id));
    count.title = t("RELGRAPH.Condition.NodeCount");
    row.append(iconElement(condition.icon), name, count);
    if (row instanceof HTMLButtonElement) {
      row.type = "button";
      if (isBuiltinCondition(condition.id)) {
        row.disabled = true;
        row.title = t("RELGRAPH.Condition.BuiltinHint");
      } else {
        row.addEventListener("click", () => callbacks.onEdit(condition.id));
      }
    }
    // стрелки — у того, кто правит справочник (GM в режиме редактирования)
    body.append(reorderRow ? reorderRow(row, condition.id, index) : row);
  });

  element.append(panelHeader(t("RELGRAPH.Common.Conditions"), callbacks.onClose), body);
  if (options.editable) {
    const footer = document.createElement("div");
    footer.className = "frg-panel-footer";
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = t("RELGRAPH.Condition.Create");
    create.addEventListener("click", () => callbacks.onCreate());
    footer.append(create);
    element.append(footer);
  }
  return element;
}

export interface ConditionPanelCallbacks {
  onSave(values: ConditionEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/** condition === null — создание нового состояния (без кнопки удаления). */
export function createConditionPanel(condition: ConditionDef | null, callbacks: ConditionPanelCallbacks): HTMLElement {
  const label = textInput(
    condition && !isDefaultConditionLabel(condition.label) ? condition.label : "",
    t("RELGRAPH.Condition.DefaultName"),
  );
  // Font Awesome в Foundry уже подключён — иконки сетки и предпросмотр своей — просто классы.
  const icon = createIconPicker(condition?.icon ?? "");

  const shell = createPanelShell(condition ? t("RELGRAPH.Condition.Panel") : t("RELGRAPH.Condition.DefaultName"), condition ? t("RELGRAPH.Condition.Delete") : null, {
    onSave: () => callbacks.onSave({ label: label.value, icon: icon.value() }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(
    field(t("RELGRAPH.Common.Name"), label),
    // не <label>: внутри — много кнопок и своё поле
    group(t("RELGRAPH.Condition.Icon"), icon.element),
  );
  return shell.element;
}
