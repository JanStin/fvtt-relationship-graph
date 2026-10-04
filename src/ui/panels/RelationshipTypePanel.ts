/**
 * Панели справочника типов связей: список и форма одного типа. Правит только GM, игрок видит
 * список только для чтения.
 * Устроены как панели фракций (FactionPanel.ts): только DOM, логика — core/relationship-types.ts.
 */

import { t } from "../../core/i18n";
import type { RelationshipType } from "../../core/model";
import { dashPresets, isDefaultRelationshipTypeLabel, relationshipTypeLabel, type RelationshipTypeEditValues } from "../../core/relationship-types";
import { colorField, createPanelShell, field, hint, panelHeader, select, textInput } from "./form";

const NEW_TYPE_COLOR = "#64748b";

export interface RelationshipTypeListCallbacks {
  onEdit(typeId: string): void;
  onCreate(): void;
  onClose(): void;
}

export function createRelationshipTypeListPanel(
  types: readonly RelationshipType[],
  /** Сколько связей имеют этот тип. */
  usageCount: (typeId: string) => number,
  callbacks: RelationshipTypeListCallbacks,
  /** false — список только для чтения: у игрока и в режиме просмотра. */
  options: { editable: boolean },
): HTMLElement {
  const { editable } = options;
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  if (types.length === 0) body.append(hint(t("RELGRAPH.RelationshipType.None")));
  for (const type of types) {
    // у игрока строка — просто текст, без клика
    const row = document.createElement(editable ? "button" : "div");
    if (row instanceof HTMLButtonElement) row.type = "button";
    row.className = "frg-faction-row";
    const swatch = document.createElement("span");
    swatch.className = "frg-faction-swatch";
    swatch.style.background = type.color;
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = relationshipTypeLabel(type);
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(usageCount(type.id));
    count.title = t("RELGRAPH.RelationshipType.EdgeCount");
    row.append(swatch, name, count);
    if (editable) row.addEventListener("click", () => callbacks.onEdit(type.id));
    body.append(row);
  }

  element.append(panelHeader(t("RELGRAPH.Common.RelationshipTypes"), callbacks.onClose), body);
  if (editable) {
    const footer = document.createElement("div");
    footer.className = "frg-panel-footer";
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = t("RELGRAPH.RelationshipType.Create");
    create.addEventListener("click", () => callbacks.onCreate());
    footer.append(create);
    element.append(footer);
  }
  return element;
}

export interface RelationshipTypePanelCallbacks {
  onSave(values: RelationshipTypeEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/** type === null — создание нового типа (без кнопки удаления). */
export function createRelationshipTypePanel(
  type: RelationshipType | null,
  callbacks: RelationshipTypePanelCallbacks,
): HTMLElement {
  // Пустое название — подсказка с тем, что будет показано (перевод встроенного или «Новый тип связи»).
  const label = textInput(
    type && !isDefaultRelationshipTypeLabel(type) ? type.label : "",
    type ? relationshipTypeLabel(type) : t("RELGRAPH.RelationshipType.DefaultName"),
  );
  const color = colorField(type?.color ?? NEW_TYPE_COLOR);

  // Стиль, которого нет среди готовых (например из импорта), сохраняем отдельным пунктом.
  const currentDash = type?.dash ?? "";
  const presets = dashPresets();
  const options = presets.some((p) => p.value === currentDash)
    ? presets
    : [...presets, { value: currentDash, label: t("RELGRAPH.RelationshipType.DashCustom", { dash: currentDash }) }];
  const dash = select(options, currentDash);

  const shell = createPanelShell(type ? t("RELGRAPH.Edge.Type") : t("RELGRAPH.RelationshipType.DefaultName"), type ? t("RELGRAPH.RelationshipType.Delete") : null, {
    onSave: () => callbacks.onSave({ label: label.value, color: color.value(), dash: dash.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(field(t("RELGRAPH.Common.Name"), label), field(t("RELGRAPH.Common.Color"), color.element), field(t("RELGRAPH.RelationshipType.LineStyle"), dash));
  return shell.element;
}
