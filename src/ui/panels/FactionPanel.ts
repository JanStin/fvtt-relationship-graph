/**
 * Панели фракций: список всех фракций и форма одной фракции (создание/правка). Игрок видит
 * список и правит только описание (B14).
 * Как и NodePanel — только DOM; применение значений — core/edit.ts, сохранение — GraphApp.
 *
 * Список нужен потому, что фракция без узлов на графе не рисуется (см. graph-renderer.ts) —
 * добраться до неё через область нельзя.
 */

import type { FactionEditValues } from "../../core/edit";
import type { Faction } from "../../core/model";
import { colorField, createPanelShell, field, hint, panelHeader, textArea, textInput } from "./form";

const NEW_FACTION_COLOR = "#6366f1";

export interface FactionListCallbacks {
  onEdit(factionId: string): void;
  onCreate(): void;
  onClose(): void;
}

export interface FactionPanelOptions {
  /** Создание, удаление, название и цвет — только GM; игрок правит только описание (B14). */
  isGM: boolean;
}

export function createFactionListPanel(
  factions: readonly Faction[],
  /** Сколько узлов состоит во фракции (в любой роли). */
  memberCount: (factionId: string) => number,
  callbacks: FactionListCallbacks,
  options: FactionPanelOptions,
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

  element.append(panelHeader("Фракции", callbacks.onClose), body);
  if (options.isGM) {
    const footer = document.createElement("div");
    footer.className = "frg-panel-footer";
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = "Создать фракцию";
    create.addEventListener("click", () => callbacks.onCreate());
    footer.append(create);
    element.append(footer);
  }
  return element;
}

export interface FactionPanelCallbacks {
  onSave(values: FactionEditValues): void;
  onDelete(): void;
  onClose(): void;
}

/**
 * faction === null — создание новой фракции (без кнопки удаления). У игрока название и цвет
 * заблокированы и кнопки удаления нет — править можно только описание.
 */
export function createFactionPanel(
  faction: Faction | null,
  callbacks: FactionPanelCallbacks,
  options: FactionPanelOptions,
): HTMLElement {
  const { isGM } = options;
  const name = textInput(faction?.name ?? "");
  const color = colorField(faction?.color ?? NEW_FACTION_COLOR);
  name.disabled = !isGM;
  color.element.querySelectorAll("input").forEach((input) => {
    input.disabled = !isGM;
  });

  const description = textArea(faction?.description ?? "", 4);

  const shell = createPanelShell(faction ? "Фракция" : "Новая фракция", faction && isGM ? "Удалить фракцию" : null, {
    onSave: () => callbacks.onSave({ name: name.value, color: color.value(), description: description.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(field("Название", name), field("Цвет", color.element), field("Описание", description));
  if (!isGM) shell.body.append(hint("Название и цвет фракции меняет только GM."));
  return shell.element;
}
