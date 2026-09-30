/**
 * Панели справочника типов связей (только GM): список и форма одного типа.
 * Устроены как панели фракций (FactionPanel.ts): только DOM, логика — core/relationship-types.ts.
 */

import type { RelationshipType } from "../../core/model";
import { DASH_PRESETS, type RelationshipTypeEditValues } from "../../core/relationship-types";
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
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  if (types.length === 0) body.append(hint("Типов связей пока нет."));
  for (const type of types) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "frg-faction-row";
    const swatch = document.createElement("span");
    swatch.className = "frg-faction-swatch";
    swatch.style.background = type.color;
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = type.label;
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(usageCount(type.id));
    count.title = "Связей этого типа";
    row.append(swatch, name, count);
    row.addEventListener("click", () => callbacks.onEdit(type.id));
    body.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "frg-panel-footer";
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "Создать тип связи";
  create.addEventListener("click", () => callbacks.onCreate());
  footer.append(create);

  element.append(panelHeader("Типы связей", callbacks.onClose), body, footer);
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
  const label = textInput(type?.label ?? "");
  const color = colorField(type?.color ?? NEW_TYPE_COLOR);

  // Стиль, которого нет среди готовых (например из импорта), сохраняем отдельным пунктом.
  const currentDash = type?.dash ?? "";
  const options = DASH_PRESETS.some((p) => p.value === currentDash)
    ? DASH_PRESETS
    : [...DASH_PRESETS, { value: currentDash, label: `Свой (${currentDash})` }];
  const dash = select(options, currentDash);

  const shell = createPanelShell(type ? "Тип связи" : "Новый тип связи", type ? "Удалить тип связи" : null, {
    onSave: () => callbacks.onSave({ label: label.value, color: color.value(), dash: dash.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(field("Название", label), field("Цвет", color.element), field("Стиль линии", dash));
  return shell.element;
}
