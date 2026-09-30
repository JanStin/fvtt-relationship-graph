/**
 * Боковая панель редактирования узла. Только собирает форму и отдаёт введённые значения —
 * нормализацию и применение к GraphData делает core/edit.ts, сохранение — GraphApp.
 */

import { conditionIconClass } from "../../core/conditions";
import { primaryAfterUncheck, type NodeEditValues } from "../../core/edit";
import type { ConditionDef, Faction, GraphNode } from "../../core/model";
import { SCALE_MAX, SCALE_MIN } from "../../core/selection";
import { checkbox, createPanelShell, field, hint, textArea, textInput } from "./form";

declare const foundry: any;

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

interface FactionPicker {
  element: HTMLElement;
  /** Отмеченные фракции в порядке списка и основная среди них (null — ни одной не отмечено). */
  value(): { factionIds: string[]; primaryFactionId: string | null };
}

/**
 * Список фракций: чекбокс «состоит» + радиокнопка «основная» в той же строке.
 * Если отмечена хотя бы одна фракция, основная обязательна: первая отмеченная становится
 * основной сама, снятие галочки с основной передаёт роль следующей отмеченной.
 */
function createFactionPicker(node: GraphNode, factions: readonly Faction[]): FactionPicker {
  const element = document.createElement("div");
  element.className = "frg-field";
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = "Фракции (отметка справа — основная, область)";
  element.append(caption);
  if (factions.length === 0) element.append(hint("Фракций пока нет — создайте их через ПКМ → «Фракции…»."));

  const order = factions.map((f) => f.id);
  const rows = new Map<string, { check: HTMLInputElement; radio: HTMLInputElement }>();
  const checkedIds = () => new Set(order.filter((id) => rows.get(id)!.check.checked));
  const setPrimary = (id: string | null) => {
    rows.forEach((row, rowId) => {
      row.radio.checked = rowId === id;
    });
  };

  for (const faction of factions) {
    const row = document.createElement("div");
    row.className = "frg-faction-pick";

    const label = document.createElement("label");
    label.className = "frg-check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = node.factionIds.includes(faction.id);
    const swatch = document.createElement("span");
    swatch.className = "frg-faction-swatch";
    swatch.style.background = faction.color;
    const name = document.createElement("span");
    name.textContent = faction.name;
    label.append(check, swatch, name);

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `frg-primary-faction-${node.id}`;
    radio.title = "Основная фракция";
    radio.checked = node.primaryFactionId === faction.id;

    check.addEventListener("change", () => {
      if (check.checked) {
        if (![...rows.values()].some((r) => r.radio.checked)) setPrimary(faction.id);
      } else if (radio.checked) {
        setPrimary(primaryAfterUncheck(order, checkedIds(), faction.id));
      }
    });
    // Основной может быть только фракция, в которой узел состоит.
    radio.addEventListener("change", () => {
      if (radio.checked) check.checked = true;
    });

    rows.set(faction.id, { check, radio });
    row.append(label, radio);
    element.append(row);
  }

  return {
    element,
    value() {
      const factionIds = [...checkedIds()];
      const primaryFactionId = factionIds.find((id) => rows.get(id)!.radio.checked) ?? null;
      return { factionIds, primaryFactionId };
    },
  };
}

/** Состояния чекбоксами: весь справочник (встроенные + свои), у каждого его иконка. */
function createConditionPicker(
  node: GraphNode,
  conditions: readonly ConditionDef[],
): { element: HTMLElement; value(): string[] } {
  const element = document.createElement("div");
  element.className = "frg-field";
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = "Состояния";
  element.append(caption);

  const inputs = conditions.map((condition) => {
    const { row, input } = checkbox(condition.label, node.conditions.includes(condition.id));
    const icon = document.createElement("i");
    icon.className = `${conditionIconClass(condition.icon)} frg-condition-icon`;
    input.after(icon);
    element.append(row);
    return { id: condition.id, input };
  });

  return { element, value: () => inputs.filter((i) => i.input.checked).map((i) => i.id) };
}

export function createNodePanel(
  node: GraphNode,
  factions: readonly Faction[],
  /** Весь справочник состояний: встроенные + свои. */
  conditions: readonly ConditionDef[],
  callbacks: NodePanelCallbacks,
): HTMLElement {
  const actorBound = node.actorId !== null;

  const name = textInput(node.name);
  const img = textInput(node.img);
  const role = textInput(node.role);
  const factionPicker = createFactionPicker(node, factions);
  const scale = document.createElement("input");
  scale.type = "number";
  scale.min = String(SCALE_MIN);
  scale.max = String(SCALE_MAX);
  scale.step = "0.1";
  scale.value = String(node.scale);
  const conditionPicker = createConditionPicker(node, conditions);
  const lore = textArea(node.lore, 4);
  const playerNotes = textArea(node.playerNotes);
  const gmNotes = textArea(node.gmNotes);

  const shell = createPanelShell("Узел", "Удалить узел", {
    onSave: () =>
      callbacks.onSave({
        name: name.value,
        img: img.value,
        role: role.value,
        ...factionPicker.value(),
        scale: scale.valueAsNumber,
        lore: lore.value,
        playerNotes: playerNotes.value,
        gmNotes: gmNotes.value,
        conditions: conditionPicker.value(),
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
    factionPicker.element,
    field("Размер", scale),
    conditionPicker.element,
    field("Описание", lore),
    field("Заметки для игроков", playerNotes),
    field("Заметки GM", gmNotes),
  );
  return shell.element;
}
