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

export function createEdgePanel(
  edge: GraphEdge,
  /** Имена концов связи — только для подписи "кто с кем". */
  endpoints: { source: string; target: string },
  relationshipTypes: readonly RelationshipType[],
  callbacks: EdgePanelCallbacks,
): HTMLElement {
  const label = textInput(edge.label);
  const type = select(
    [{ value: NO_TYPE, label: "— не задан —" }, ...relationshipTypes.map((rt) => ({ value: rt.id, label: rt.label }))],
    edge.relationshipTypeId,
  );
  const directional = checkbox("Направленная (со стрелкой)", edge.directional);
  const gmOnly = checkbox("Видна только GM", edge.gmOnly);

  const shell = createPanelShell("Связь", "Удалить связь", {
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
    field("Подпись", label),
    field("Тип связи", type),
    directional.row,
    gmOnly.row,
  );
  return shell.element;
}
