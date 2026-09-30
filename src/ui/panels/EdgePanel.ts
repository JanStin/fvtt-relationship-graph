/**
 * Боковая панель редактирования связи. Как и NodePanel — только форма; применение
 * значений — core/edit.ts, сохранение — GraphApp.
 */

import type { EdgeEditValues } from "../../core/edit";
import type { GraphEdge, RelationshipType } from "../../core/model";
import { checkbox, createPanelShell, field, hint, select, textInput } from "./form";

const NO_TYPE = ""; // совпадает с "тип не задан" в модели (relationshipTypeId: '')

export interface EdgePanelCallbacks {
  onSave(values: EdgeEditValues): void;
  onDelete(): void;
  onClose(): void;
}

export interface EdgePanelOptions {
  /** true — связь ещё не создана: появится только после сохранения, кнопки удаления нет. */
  isNew?: boolean;
  /** Игрок не видит флажок «Видна только GM» и не может удалить связь. */
  isGM: boolean;
}

export function createEdgePanel(
  edge: GraphEdge,
  /** Имена концов связи — только для подписи "кто с кем". */
  endpoints: { source: string; target: string },
  relationshipTypes: readonly RelationshipType[],
  callbacks: EdgePanelCallbacks,
  options: EdgePanelOptions,
): HTMLElement {
  const { isNew = false, isGM } = options;
  const label = textInput(edge.label);
  const type = select(
    [{ value: NO_TYPE, label: "— не задан —" }, ...relationshipTypes.map((rt) => ({ value: rt.id, label: rt.label }))],
    edge.relationshipTypeId,
  );
  const directional = checkbox("Направленная (со стрелкой)", edge.directional);
  const gmOnly = checkbox("Видна только GM", edge.gmOnly);

  const shell = createPanelShell(isNew ? "Новая связь" : "Связь", isNew || !isGM ? null : "Удалить связь", {
    onSave: () =>
      callbacks.onSave({
        label: label.value,
        relationshipTypeId: type.value,
        directional: directional.input.checked,
        gmOnly: gmOnly.input.checked,
      }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(
    hint(`${endpoints.source} → ${endpoints.target}`),
    ...(isNew ? [hint("Связь появится после сохранения. Если ничего не заполнить, она не создаётся.")] : []),
    field("Подпись", label),
    field("Тип связи", type),
    directional.row,
    // у игрока флажка нет — при сохранении уходит прежнее значение (input остаётся как был)
    ...(isGM ? [gmOnly.row] : []),
  );
  return shell.element;
}
