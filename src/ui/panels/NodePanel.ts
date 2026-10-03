/**
 * Боковая панель редактирования узла. Только собирает форму и отдаёт введённые значения —
 * нормализацию и применение к GraphData делает core/edit.ts, сохранение — GraphApp.
 * Вкладки: «Инфо» — тексты и флаги видимости, «Вид» — тип, актёр, изображение и размер,
 * «Метки» — фракции и состояния.
 */

import { conditionIconClass } from "../../core/conditions";
import { primaryAfterUncheck, type NodeEditValues } from "../../core/edit";
import { normalizeImageAlign } from "../../core/image-align";
import type { ConditionDef, Faction, GraphNode, ImageAlign, ImageFit, ImageSource, NodeType } from "../../core/model";
import { normalizeImageFit, normalizeImageSource } from "../../core/node-image";
import { SCALE_MAX, SCALE_MIN } from "../../core/selection";
import { addPanelTabs, browseImage, checkbox, createPanelShell, field, hint, select, textArea, textInput } from "./form";

const NO_ACTOR = ""; // значение <option> «не выбран»; id актёров пустыми не бывают

const NODE_TYPE_OPTIONS: ReadonlyArray<{ value: NodeType; label: string }> = [
  { value: "actor", label: "Актёр" },
  { value: "placeholder", label: "Без актёра" },
  { value: "image", label: "Просто изображение" },
];

const IMAGE_SOURCE_OPTIONS: ReadonlyArray<{ value: ImageSource; label: string }> = [
  { value: "portrait", label: "Портрет" },
  { value: "token", label: "Токен" },
];

const IMAGE_FIT_OPTIONS: ReadonlyArray<{ value: ImageFit; label: string }> = [
  { value: "cover", label: "Заполнить (обрезать лишнее)" },
  { value: "contain", label: "Вписать целиком" },
  { value: "fill", label: "Растянуть" },
  { value: "scale-down", label: "Вписать, не увеличивая" },
];

const IMAGE_ALIGN_OPTIONS: ReadonlyArray<{ value: ImageAlign; label: string }> = [
  { value: "top-left", label: "Сверху / слева" },
  { value: "top-right", label: "Сверху / справа" },
  { value: "center", label: "По центру" },
  { value: "bottom-left", label: "Снизу / слева" },
  { value: "bottom-right", label: "Снизу / справа" },
];

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
  caption.textContent = "Фракции (отметка справа — основная, область)";
  element.append(caption);
  if (factions.length === 0) {
    element.append(hint(isGM ? "Фракций пока нет — создайте их через ПКМ → «Фракции…»." : "Фракций пока нет."));
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
    isGM || node.type === "actor" ? NODE_TYPE_OPTIONS : NODE_TYPE_OPTIONS.filter((o) => o.value !== "actor");
  const type = select(typeOptions, node.type);
  const actor = select(
    [{ value: NO_ACTOR, label: "— не выбран —" }, ...actors.map((a) => ({ value: a.id, label: a.name }))],
    node.actorId ?? NO_ACTOR,
  );

  const name = textInput(node.name);
  const img = textInput(node.img);
  const imageSource = select(IMAGE_SOURCE_OPTIONS, normalizeImageSource(node.imageSource));
  const imageFit = select(IMAGE_FIT_OPTIONS, normalizeImageFit(node.imageFit));
  const imageAlign = select(IMAGE_ALIGN_OPTIONS, normalizeImageAlign(node.imageAlign));
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
  const hidden = checkbox("Скрыт от игроков (виден как «неизвестный»)", node.hidden);
  const gmOnly = checkbox("Правит только GM", node.gmOnly);
  // hidden всегда подразумевает gmOnly (core/visibility.ts): флажок включается и блокируется.
  const syncFlags = () => {
    if (hidden.input.checked) gmOnly.input.checked = true;
    gmOnly.input.disabled = hidden.input.checked;
  };
  hidden.input.addEventListener("change", syncFlags);
  syncFlags();

  const shell = createPanelShell("Узел", "Удалить узел", {
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
  browse.textContent = "Обзор";
  browse.addEventListener("click", () => browseImage(img));
  imgRow.append(img, browse);

  const actorField = field("Актёр", actor);
  const actorHint = hint("Имя и изображение берутся из актёра — меняйте их в листе актёра.");
  const nameHint = hint("Имя берётся из актёра (вкладка «Вид»).");
  const sourceField = field(
    "Изображение актёра",
    imageSource,
    hint("Токен с шаблонным изображением (путь со *) показывается портретом."),
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

  const typeField = field("Тип узла", type);
  typeField.hidden = !isGM && node.type === "actor";

  addPanelTabs(shell, [
    {
      label: "Инфо",
      content: [
        field("Имя", name),
        nameHint,
        field("Роль", role),
        field("Описание", lore),
        field("Заметки для игроков", playerNotes),
        // у игрока этих полей нет — при сохранении прежние значения подставит core/permissions.ts
        ...(isGM ? [field("Заметки GM", gmNotes), hidden.row, gmOnly.row] : []),
      ],
    },
    {
      label: "Вид",
      content: [
        typeField,
        actorField,
        field("Изображение", imgRow),
        actorHint,
        sourceField,
        // у привязанного к актёру узла тоже можно: картинка от актёра, вид — свой
        field("Вписывание изображения", imageFit),
        field(
          "Выравнивание изображения",
          imageAlign,
          hint("Если изображение не совпадает с узлом по форме, выравнивание решает, к какому краю его прижать."),
        ),
        field("Размер", scale),
      ],
    },
    { label: "Метки", content: [factionPicker.element, conditionPicker.element] },
  ]);
  return shell.element;
}
