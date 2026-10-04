/**
 * Боковая панель редактирования узла. Только собирает форму и отдаёт введённые значения —
 * нормализацию и применение к GraphData делает core/edit.ts, сохранение — GraphApp.
 * Вкладки: «Инфо» — тексты и флаги видимости, «Вид» — тип, актёр, изображение и размер,
 * «Метки» — фракции и состояния.
 */

import { conditionIconClass, conditionLabel } from "../../core/conditions";
import { factionName, primaryAfterUncheck, type NodeEditValues } from "../../core/edit";
import { t } from "../../core/i18n";
import { normalizeImageAlign } from "../../core/image-align";
import type { ConditionDef, Faction, GraphNode, ImageAlign, ImageFit, ImageSource, NodeType } from "../../core/model";
import { normalizeImageFit, normalizeImageSource } from "../../core/node-image";
import { SCALE_MAX, SCALE_MIN } from "../../core/selection";
import { isDefaultNodeName } from "../../core/visibility";
import { addPanelTabs, browseImage, checkbox, createPanelShell, field, hint, select, textArea, textInput } from "./form";

const NO_ACTOR = ""; // значение <option> «не выбран»; id актёров пустыми не бывают

// Списки — функции: названия переводятся при каждой сборке панели, на текущем языке.
function nodeTypeOptions(): Array<{ value: NodeType; label: string }> {
  return [
    { value: "actor", label: t("RELGRAPH.NodeType.Actor") },
    { value: "placeholder", label: t("RELGRAPH.NodeType.Placeholder") },
    { value: "image", label: t("RELGRAPH.Node.ImageOnly") },
  ];
}

function imageSourceOptions(): Array<{ value: ImageSource; label: string }> {
  return [
    { value: "portrait", label: t("RELGRAPH.Node.ActorImagePortrait") },
    { value: "token", label: t("RELGRAPH.Node.ActorImageToken") },
  ];
}

function imageFitOptions(): Array<{ value: ImageFit; label: string }> {
  return [
    { value: "cover", label: t("RELGRAPH.Node.FitCover") },
    { value: "contain", label: t("RELGRAPH.Node.FitContain") },
    { value: "fill", label: t("RELGRAPH.Node.FitFill") },
    { value: "scale-down", label: t("RELGRAPH.Node.FitScaleDown") },
  ];
}

function imageAlignOptions(): Array<{ value: ImageAlign; label: string }> {
  return [
    { value: "top-left", label: t("RELGRAPH.Node.AlignTopLeft") },
    { value: "top-right", label: t("RELGRAPH.Node.AlignTopRight") },
    { value: "center", label: t("RELGRAPH.Node.AlignCenter") },
    { value: "bottom-left", label: t("RELGRAPH.Node.AlignBottomLeft") },
    { value: "bottom-right", label: t("RELGRAPH.Node.AlignBottomRight") },
  ];
}

export interface ActorOption {
  id: string;
  name: string;
}

export interface NodePanelOptions {
  /** Только GM видит заметки GM, флажки видимости (hidden/gmOnly) и привязку к актёру. */
  isGM: boolean;
}

export interface NodePanelCallbacks {
  onSave(values: NodeEditValues): void;
  onDelete(): void;
  onClose(): void;
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
function createFactionPicker(node: GraphNode, factions: readonly Faction[], isGM: boolean): FactionPicker {
  const element = document.createElement("div");
  element.className = "frg-field";
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = t("RELGRAPH.Node.FactionPicker");
  element.append(caption);
  if (factions.length === 0) {
    element.append(hint(isGM ? t("RELGRAPH.Node.NoFactions") : t("RELGRAPH.Faction.None")));
  }

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
    name.textContent = factionName(faction);
    label.append(check, swatch, name);

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `frg-primary-faction-${node.id}`;
    radio.title = t("RELGRAPH.Node.PrimaryFaction");
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
  caption.textContent = t("RELGRAPH.Common.Conditions");
  element.append(caption);

  const inputs = conditions.map((condition) => {
    const { row, input } = checkbox(conditionLabel(condition), node.conditions.includes(condition.id));
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
  /** Актёры мира для привязки узла. */
  actors: readonly ActorOption[],
  callbacks: NodePanelCallbacks,
  options: NodePanelOptions,
): HTMLElement {
  const { isGM } = options;
  // Привязку к актёру меняет только GM: игрок выбирает лишь между «без актёра» и
  // «просто изображение», а у привязанного узла поля типа и актёра не видит вовсе.
  // (У привязанного узла список полный — поле всё равно скрыто, а значение "actor" нужно
  // syncBinding, чтобы заблокировать имя и изображение.)
  const typeOptions =
    isGM || node.type === "actor" ? nodeTypeOptions() : nodeTypeOptions().filter((o) => o.value !== "actor");
  const type = select(typeOptions, node.type);
  const actor = select(
    [{ value: NO_ACTOR, label: t("RELGRAPH.Common.NotSelected") }, ...actors.map((a) => ({ value: a.id, label: a.name }))],
    node.actorId ?? NO_ACTOR,
  );

  // Не заданное пользователем имя не подставляется значением (было бы на чужом языке) — видно подсказкой.
  const name = textInput(
    isDefaultNodeName(node) ? "" : node.name,
    node.type === "image" ? "" : t("RELGRAPH.Node.DefaultName"),
  );
  const img = textInput(node.img);
  const imageSource = select(imageSourceOptions(), normalizeImageSource(node.imageSource));
  const imageFit = select(imageFitOptions(), normalizeImageFit(node.imageFit));
  const imageAlign = select(imageAlignOptions(), normalizeImageAlign(node.imageAlign));
  const role = textInput(node.role);
  const factionPicker = createFactionPicker(node, factions, isGM);
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
  const hidden = checkbox(t("RELGRAPH.Node.HiddenHint"), node.hidden);
  const gmOnly = checkbox(t("RELGRAPH.Node.GmOnly"), node.gmOnly);
  // hidden всегда подразумевает gmOnly (core/visibility.ts): флажок включается и блокируется.
  const syncFlags = () => {
    if (hidden.input.checked) gmOnly.input.checked = true;
    gmOnly.input.disabled = hidden.input.checked;
  };
  hidden.input.addEventListener("change", syncFlags);
  syncFlags();

  const shell = createPanelShell(t("RELGRAPH.Node.Panel"), t("RELGRAPH.Node.Delete"), {
    onSave: () =>
      callbacks.onSave({
        type: type.value as NodeType,
        actorId: actor.value === NO_ACTOR ? null : actor.value,
        name: name.value,
        img: img.value,
        imageSource: imageSource.value as ImageSource,
        imageFit: imageFit.value as ImageFit,
        imageAlign: imageAlign.value as ImageAlign,
        role: role.value,
        ...factionPicker.value(),
        scale: scale.valueAsNumber,
        lore: lore.value,
        playerNotes: playerNotes.value,
        gmNotes: gmNotes.value,
        conditions: conditionPicker.value(),
        hidden: hidden.input.checked,
        gmOnly: gmOnly.input.checked,
      }),
    onDelete: callbacks.onDelete,
    onClose: callbacks.onClose,
  });

  const imgRow = document.createElement("div");
  imgRow.className = "frg-field-row";
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = t("RELGRAPH.Common.Browse");
  browse.addEventListener("click", () => browseImage(img));
  imgRow.append(img, browse);

  const actorField = field(t("RELGRAPH.NodeType.Actor"), actor);
  const actorHint = hint(t("RELGRAPH.Node.ActorHint"));
  const nameHint = hint(t("RELGRAPH.Node.ActorNameHint"));
  const sourceField = field(
    t("RELGRAPH.Node.ActorImage"),
    imageSource,
    hint(t("RELGRAPH.Node.ActorImageWildcardHint")),
  );
  // Имя и картинку привязанного узла при каждом открытии графа перезаписывает актёр,
  // поэтому при выбранном актёре эти поля заблокированы.
  const syncBinding = () => {
    const isActor = type.value === "actor";
    const bound = isActor && actor.value !== NO_ACTOR;
    actorField.hidden = !isActor || !isGM;
    actorHint.hidden = !bound;
    nameHint.hidden = !bound;
    sourceField.hidden = !bound;
    name.disabled = bound;
    img.disabled = bound;
    browse.disabled = bound;
  };
  type.addEventListener("change", syncBinding);
  actor.addEventListener("change", syncBinding);
  syncBinding();

  const typeField = field(t("RELGRAPH.Node.Type"), type);
  typeField.hidden = !isGM && node.type === "actor";

  addPanelTabs(shell, [
    {
      label: t("RELGRAPH.Node.TabInfo"),
      content: [
        field(t("RELGRAPH.Node.Name"), name),
        nameHint,
        field(t("RELGRAPH.Common.Role"), role),
        field(t("RELGRAPH.Common.Description"), lore),
        field(t("RELGRAPH.Node.PlayerNotes"), playerNotes),
        // у игрока этих полей нет — при сохранении прежние значения подставит core/permissions.ts
        ...(isGM ? [field(t("RELGRAPH.Node.GmNotes"), gmNotes), hidden.row, gmOnly.row] : []),
      ],
    },
    {
      label: t("RELGRAPH.Node.TabLook"),
      content: [
        typeField,
        actorField,
        field(t("RELGRAPH.NodeType.Image"), imgRow),
        actorHint,
        sourceField,
        // у привязанного к актёру узла тоже можно: картинка от актёра, вид — свой
        field(t("RELGRAPH.Node.ImageFit"), imageFit),
        field(
          t("RELGRAPH.Node.ImageAlign"),
          imageAlign,
          hint(t("RELGRAPH.Node.ImageAlignHint")),
        ),
        field(t("RELGRAPH.Common.Size"), scale),
      ],
    },
    { label: t("RELGRAPH.Node.TabLabels"), content: [factionPicker.element, conditionPicker.element] },
  ]);
  return shell.element;
}
