/**
 * Панели фракций: список всех фракций и форма одной фракции (создание/правка). Игрок видит
 * список и правит только описание.
 * Как и NodePanel — только DOM; применение значений — core/edit.ts, сохранение — GraphApp.
 *
 * Список нужен потому, что фракция без узлов на графе не рисуется (см. graph-renderer.ts) —
 * добраться до неё через область нельзя.
 */

import { factionName, isDefaultFactionName, type FactionEditValues } from "../../core/edit";
import { t } from "../../core/i18n";
import type { Faction } from "../../core/model";
import { appendColorSuggestions, colorField, contentLinksHint, createPanelShell, field, hint, linkTextArea, panelHeader, catalogReorder, textInput } from "./form";

const NEW_FACTION_COLOR = "#6366f1";

export interface FactionListCallbacks {
  /** Клик по строке в режиме редактирования — форма фракции. */
  onEdit(factionId: string): void;
  /** Клик по строке в режиме просмотра — сведения фракции. */
  onInfo(factionId: string): void;
  onCreate(): void;
  /** Стрелка ↑/↓ или перетаскивание строки (только при reorderable); index — её новое место. */
  onMove(factionId: string, index: number): void;
  onClose(): void;
}

export interface FactionPanelOptions {
  /** Создание, удаление, название и цвет — только GM; игрок правит только описание. */
  isGM: boolean;
  /** Цвета для новой фракции (core/color.distinctColors): первый — в поле, остальные — по кнопке. */
  newColors?: readonly string[];
}

export interface FactionListOptions {
  /** false — режим просмотра: строки открывают сведения, а не форму; создавать нельзя. */
  editable: boolean;
  /** Кнопка «Создать фракцию» (только GM, и только когда editable). */
  canCreate: boolean;
  /** Стрелки ручного порядка (только GM в режиме редактирования). */
  reorderable: boolean;
}

export function createFactionListPanel(
  factions: readonly Faction[],
  /** Сколько узлов состоит во фракции (в любой роли). */
  memberCount: (factionId: string) => number,
  callbacks: FactionListCallbacks,
  options: FactionListOptions,
): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  if (factions.length === 0) body.append(hint(t("RELGRAPH.Faction.None")));
  const reorderRow = options.reorderable ? catalogReorder(factions.length, (id, index) => callbacks.onMove(id, index)) : null;
  factions.forEach((faction, index) => {
    // в режиме просмотра — сведения: единственный путь к фракции без узлов (её области нет)
    const row = document.createElement("button");
    row.type = "button";
    row.className = "frg-faction-row";
    const swatch = document.createElement("span");
    swatch.className = "frg-faction-swatch";
    swatch.style.background = faction.color;
    const name = document.createElement("span");
    name.className = "frg-faction-name";
    name.textContent = factionName(faction);
    const count = document.createElement("span");
    count.className = "frg-field-hint";
    count.textContent = String(memberCount(faction.id));
    count.title = t("RELGRAPH.Faction.NodeCount");
    row.append(swatch, name, count);
    row.addEventListener("click", () => (options.editable ? callbacks.onEdit(faction.id) : callbacks.onInfo(faction.id)));
    body.append(reorderRow ? reorderRow(row, faction.id, index) : row);
  });

  element.append(panelHeader(t("RELGRAPH.Common.Factions"), callbacks.onClose), body);
  if (options.editable && options.canCreate) {
    const footer = document.createElement("div");
    footer.className = "frg-panel-footer";
    const create = document.createElement("button");
    create.type = "button";
    create.textContent = t("RELGRAPH.Faction.Create");
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
  const name = textInput(faction && !isDefaultFactionName(faction.name) ? faction.name : "", t("RELGRAPH.Faction.DefaultName"), {
    spellcheck: true,
  });
  const color = colorField(faction?.color ?? options.newColors?.[0] ?? NEW_FACTION_COLOR);
  if (!faction && isGM) appendColorSuggestions(color, options.newColors ?? []);
  name.disabled = !isGM;
  color.element.querySelectorAll("input").forEach((input) => {
    input.disabled = !isGM;
  });

  const description = linkTextArea(faction?.description ?? "", 4);

  const shell = createPanelShell(faction ? t("RELGRAPH.Faction.Panel") : t("RELGRAPH.Faction.DefaultName"), faction && isGM ? t("RELGRAPH.Faction.Delete") : null, {
    onSave: () => callbacks.onSave({ name: name.value, color: color.value(), description: description.value }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  shell.body.append(field(t("RELGRAPH.Common.Name"), name), field(t("RELGRAPH.Common.Color"), color.element), field(t("RELGRAPH.Common.Description"), description), contentLinksHint());
  if (!isGM) shell.body.append(hint(t("RELGRAPH.Faction.GmOnlyHint")));
  return shell.element;
}
