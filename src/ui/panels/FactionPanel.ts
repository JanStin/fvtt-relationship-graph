/**
 * Панели фракций (только GM): список всех фракций и форма одной фракции (создание/правка).
 * Как и NodePanel — только DOM; применение значений — core/edit.ts, сохранение — GraphApp.
 *
 * Список нужен потому, что фракция без узлов на графе не рисуется (см. graph-renderer.ts) —
 * добраться до неё через область нельзя.
 */

import type { FactionEditValues } from "../../core/edit";
import type { Faction } from "../../core/model";
import { createPanelShell, field, hint, panelHeader, textArea, textInput } from "./form";

const NEW_FACTION_COLOR = "#6366f1";
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export interface FactionListCallbacks {
  onEdit(factionId: string): void;
  onCreate(): void;
  onClose(): void;
}

export function createFactionListPanel(
  factions: readonly Faction[],
  /** Сколько узлов состоит во фракции (в любой роли). */
  memberCount: (factionId: string) => number,
  callbacks: FactionListCallbacks,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  if (factions.length === 0) body.append(hint("Фракций пока нет."));
  for (const faction of factions) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "frg-faction-row";
    const swatch = document.createElement("span");
    swatch.className = "frg-faction-swatch";
    swatch.style.background = faction.color;
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = faction.name;
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(memberCount(faction.id));
    count.title = "Узлов во фракции";
    row.append(swatch, name, count);
    row.addEventListener("click", () => callbacks.onEdit(faction.id));
    body.append(row);
  }

  const footer = document.createElement("div");
  footer.className = "frg-panel-footer";
  const create = document.createElement("button");
  create.type = "button";
  create.textContent = "Создать фракцию";
  create.addEventListener("click", () => callbacks.onCreate());
  footer.append(create);

  element.append(panelHeader("Фракции", callbacks.onClose), body, footer);
  return element;
}

export interface FactionPanelCallbacks {
  onSave(values: FactionEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/** faction === null — создание новой фракции (без кнопки удаления). */
export function createFactionPanel(faction: Faction | null, callbacks: FactionPanelCallbacks): HTMLElement {
  const name = textInput(faction?.name ?? "");
  const color = document.createElement("input");
  color.type = "color";
  // <input type="color"> понимает только #rrggbb; другой формат (например "#000" из импорта)
  // показал бы чёрный и затёр цвет при сохранении — тогда даём править его текстом.
  const storedColor = faction?.color ?? NEW_FACTION_COLOR;
  const colorText = textInput(storedColor);
  color.value = HEX_COLOR.test(storedColor) ? storedColor : "#000000";
  color.addEventListener("input", () => {
    colorText.value = color.value;
  });
  colorText.addEventListener("input", () => {
    if (HEX_COLOR.test(colorText.value.trim())) color.value = colorText.value.trim();
  });
  const colorRow = document.createElement("div");
  colorRow.className = "frg-field-row";
  colorRow.append(colorText, color);

  const description = textArea(faction?.description ?? "", 4);

  const shell = createPanelShell(faction ? "Фракция" : "Новая фракция", faction ? "Удалить фракцию" : null, {
    onSave: () => callbacks.onSave({ name: name.value, color: colorText.value, description: description.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(field("Название", name), field("Цвет", colorRow), field("Описание", description));
  return shell.element;
}
