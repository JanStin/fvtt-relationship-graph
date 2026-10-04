/**
 * Панели справочника состояний: список и форма одного состояния. Правит только GM, игрок
 * видит список только для чтения.
 * Устроены как панели фракций (FactionPanel.ts): только DOM, логика — core/conditions.ts.
 * Встроенные состояния показаны в списке, но не редактируются.
 */

import { conditionIconClass, conditionLabel, isBuiltinCondition, isDefaultConditionLabel, type ConditionEditValues } from "../../core/conditions";
import { t } from "../../core/i18n";
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
  /** false — список только для чтения: у игрока и в режиме просмотра. */
  options: { editable: boolean },
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  for (const condition of conditions) {
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
    body.append(row);
  }

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

  const shell = createPanelShell(condition ? t("RELGRAPH.Condition.Panel") : t("RELGRAPH.Condition.DefaultName"), condition ? t("RELGRAPH.Condition.Delete") : null, {
    onSave: () => callbacks.onSave({ label: label.value, icon: icon.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(
    field(t("RELGRAPH.Common.Name"), label),
    field(t("RELGRAPH.Condition.Icon"), iconRow),
    hint(t("RELGRAPH.Condition.IconHint")),
  );
  return shell.element;
}
