/**
 * Боковая панель редактирования узла. Только собирает форму и отдаёт введённые значения —
 * нормализацию и применение к GraphData делает core/edit.ts, сохранение — GraphApp.
 */

import { parseConditions, type NodeEditValues } from "../../core/edit";
import type { Faction, GraphNode } from "../../core/model";
import { SCALE_MAX, SCALE_MIN } from "../../core/selection";
import { createPanelShell, field, hint, select, textArea, textInput } from "./form";

declare const foundry: any;

const NO_FACTION = ""; // значение <option> "без фракции"; id фракций пустыми не бывают

export interface NodePanelCallbacks {
  onSave(values: NodeEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/** Штатный FilePicker Foundry для выбора изображения; путь попадает в input. */
function browseImage(input: HTMLInputElement): void {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  new FilePicker({
    type: "image",
    current: input.value,
    callback: (path: string) => {
      input.value = path;
    },
  }).browse();
}

export function createNodePanel(
  node: GraphNode,
  factions: readonly Faction[],
  callbacks: NodePanelCallbacks,
): HTMLElement {
  const actorBound = node.actorId !== null;

  const name = textInput(node.name);
  const img = textInput(node.img);
  const role = textInput(node.role);
  const faction = select(
    [{ value: NO_FACTION, label: "— без фракции —" }, ...factions.map((f) => ({ value: f.id, label: f.name }))],
    node.primaryFactionId ?? NO_FACTION,
  );
  const scale = document.createElement("input");
  scale.type = "number";
  scale.min = String(SCALE_MIN);
  scale.max = String(SCALE_MAX);
  scale.step = "0.1";
  scale.value = String(node.scale);
  const conditions = textInput(node.conditions.join(", "));
  const lore = textArea(node.lore, 4);
  const playerNotes = textArea(node.playerNotes);
  const gmNotes = textArea(node.gmNotes);

  const shell = createPanelShell("Узел", "Удалить узел", {
    onSave: () =>
      callbacks.onSave({
        name: name.value,
        img: img.value,
        role: role.value,
        primaryFactionId: faction.value === NO_FACTION ? null : faction.value,
        scale: scale.valueAsNumber,
        lore: lore.value,
        playerNotes: playerNotes.value,
        gmNotes: gmNotes.value,
        conditions: parseConditions(conditions.value),
      }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  const imgRow = document.createElement("div");
  imgRow.className = "frg-field-row";
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = "Обзор";
  browse.addEventListener("click", () => browseImage(img));
  imgRow.append(img, browse);

  if (actorBound) {
    // Имя и картинку привязанного узла при каждом открытии графа перезаписывает актёр.
    name.disabled = true;
    img.disabled = true;
    browse.disabled = true;
  }

  shell.body.append(
    field("Имя", name),
    field("Изображение", imgRow),
    ...(actorBound ? [hint("Имя и изображение берутся из актёра — меняйте их в листе актёра.")] : []),
    field("Роль", role),
    field("Фракция (область)", faction),
    field("Размер", scale),
    field("Состояния (через запятую)", conditions),
    field("Описание", lore),
    field("Заметки для игроков", playerNotes),
    field("Заметки GM", gmNotes),
  );
  return shell.element;
}
