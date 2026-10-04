/**
 * Боковая панель редактирования связи. Как и NodePanel — только форма; применение
 * значений — core/edit.ts, сохранение — GraphApp.
 */

import type { EdgeEditValues } from "../../core/edit";
import { t } from "../../core/i18n";
import type { GraphEdge, RelationshipType } from "../../core/model";
import { relationshipTypeLabel } from "../../core/relationship-types";
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
  /** Игрок не видит флажок «Видна только GM» (удалять связи может). */
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
    [{ value: NO_TYPE, label: t("RELGRAPH.Common.NotSet") }, ...relationshipTypes.map((rt) => ({ value: rt.id, label: relationshipTypeLabel(rt) }))],
    edge.relationshipTypeId,
  );
  const directional = checkbox(t("RELGRAPH.Edge.Directional"), edge.directional);
  const gmOnly = checkbox(t("RELGRAPH.Edge.GmOnly"), edge.gmOnly);

  const shell = createPanelShell(isNew ? t("RELGRAPH.Edge.New") : t("RELGRAPH.Common.Edge"), isNew ? null : t("RELGRAPH.Edge.Delete"), {
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
    ...(isNew ? [hint(t("RELGRAPH.Edge.NewHint"))] : []),
    field(t("RELGRAPH.Edge.Label"), label),
    field(t("RELGRAPH.Edge.Type"), type),
    directional.row,
    // у игрока флажка нет — при сохранении уходит прежнее значение (input остаётся как был)
    ...(isGM ? [gmOnly.row] : []),
  );
  return shell.element;
}
