import { contentLinkFromDrop } from "../../core/content-links";
import { t } from "../../core/i18n";
import { adoptIntoPopout } from "../popout";
/**
 * Общие DOM-кирпичики боковых панелей редактирования (NodePanel, EdgePanel).
 * Панель — обычный <form> в wrapper окна графа (см. GraphApp), без отдельного ApplicationV2.
 */

declare const foundry: any;

export interface PanelActions {
  /** Submit формы (кнопка "Сохранить" или Enter в однострочном поле). */
  onSave(): void;
  onDelete(): void;
  onClose(): void;
}

export interface PanelShell {
  element: HTMLFormElement;
  /** Сюда панель добавляет свои поля. */
  body: HTMLElement;
}

/** Заголовок панели с кнопкой закрытия. */
export function panelHeader(title: string, onClose: () => void): HTMLElement {
  const header = document.createElement("div");
  header.className = "frg-panel-header";
  const heading = document.createElement("div");
  heading.className = "frg-panel-title";
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "frg-panel-close";
  close.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
  close.title = t("RELGRAPH.Common.Close");
  close.setAttribute("aria-label", t("RELGRAPH.Common.Close"));
  close.addEventListener("click", () => onClose());
  header.append(heading, close);
  return header;
}

/** deleteLabel === null — без кнопки удаления (панель создания нового объекта). */
export function createPanelShell(title: string, deleteLabel: string | null, actions: PanelActions): PanelShell {
  const element = document.createElement("form");
  element.className = "frg-panel";
  element.addEventListener("submit", (e) => {
    e.preventDefault();
    actions.onSave();
  });

  const header = panelHeader(title, actions.onClose);

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  const footer = document.createElement("div");
  footer.className = "frg-panel-footer";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = t("RELGRAPH.Common.Save");
  footer.append(save);
  if (deleteLabel !== null) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "frg-panel-delete";
    remove.textContent = deleteLabel;
    remove.addEventListener("click", () => actions.onDelete());
    footer.append(remove);
  }

  element.append(header, body, footer);
  return { element, body };
}

/** Уникальные id для связи подписей и подсказок с полями (aria-labelledby / aria-describedby). */
let idCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Поля группы, которым нужны имя и описание: input/select/textarea и группы радиокнопок.
 * Радиокнопки и чекбоксы во вложенных подписях (сегменты, .frg-check) названы своими подписями.
 */
function namedControls(wrapper: HTMLElement): HTMLElement[] {
  return [...wrapper.querySelectorAll<HTMLElement>("input, select, textarea, [role='radiogroup']")].filter(
    (control) => !(control instanceof HTMLInputElement && control.type === "hidden") && !control.closest(".frg-segment, .frg-check"),
  );
}

/**
 * Связывает поля с подписью caption и подсказками (hint() среди controls). skipFirst — первое
 * поле уже названо обёрткой <label>; остальным (палитра colorField, X/Y и т. п.) имя даётся
 * через aria-labelledby, если своего aria-label у них нет.
 */
function linkControls(wrapper: HTMLElement, caption: HTMLElement, controls: readonly HTMLElement[], skipFirst: boolean): void {
  caption.id = nextId("frg-label");
  const hintIds = controls
    .filter((control) => control.classList.contains("frg-field-hint"))
    .map((element) => (element.id ||= nextId("frg-hint")));
  namedControls(wrapper).forEach((control, index) => {
    if (hintIds.length > 0) control.setAttribute("aria-describedby", hintIds.join(" "));
    if (skipFirst && index === 0) return;
    if (!control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) {
      control.setAttribute("aria-labelledby", caption.id);
    }
  });
}

/** Подпись + контрол(ы) в одну вертикальную группу; подсказки hint() среди controls описывают поля. */
export function field(label: string, ...controls: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "frg-field";
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = label;
  wrapper.append(caption, ...controls);
  linkControls(wrapper, caption, controls, true);
  return wrapper;
}

export function hint(text: string): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-field-hint";
  element.textContent = text;
  return element;
}

/** placeholder — что показывается вместо пустого значения. */
export function textInput(value: string, placeholder = ""): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  return input;
}

export function textArea(value: string, rows = 3): HTMLTextAreaElement {
  const area = document.createElement("textarea");
  area.rows = rows;
  area.value = value;
  return area;
}

/**
 * Многострочное поле для текста сведений (описание, заметки): перетащенный в него документ
 * Foundry (журнал, актёр, предмет) вставляется ссылкой `@UUID[...]` в позицию курсора.
 */
export function linkTextArea(value: string, rows = 3): HTMLTextAreaElement {
  const area = textArea(value, rows);
  area.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("text/plain")) e.preventDefault();
  });
  area.addEventListener("drop", (e) => {
    const link = contentLinkFromDrop(e.dataTransfer?.getData("text/plain") ?? "");
    if (!link) return;
    e.preventDefault();
    area.focus();
    area.setRangeText(link, area.selectionStart, area.selectionEnd, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return area;
}

/** Подсказка под полями с linkTextArea: как вставить ссылку на документ Foundry, с примером. */
export function contentLinksHint(): HTMLElement {
  const label = t("RELGRAPH.Info.LinksExample");
  // пример — параметром: фигурные скобки в строке перевода читались бы как подстановка
  return hint(t("RELGRAPH.Info.LinksHint", { example: `@UUID[JournalEntry.AbC123]{${label}}`, label }));
}

export function select(options: ReadonlyArray<{ value: string; label: string }>, current: string): HTMLSelectElement {
  const element = document.createElement("select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    element.append(item);
  }
  element.value = current;
  return element;
}

/** Чекбокс с подписью справа; возвращает и строку для вставки, и сам input. */
export function checkbox(label: string, checked: boolean): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement("label");
  row.className = "frg-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const caption = document.createElement("span");
  caption.textContent = label;
  row.append(input, caption);
  return { row, input };
}

/** Кнопка-иконка Font Awesome (верхняя панель); подпись — во всплывающей подсказке и для экранных дикторов. */
export function iconButton(icon: string, title: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "frg-toolbar-icon";
  button.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  button.title = title;
  button.setAttribute("aria-label", title);
  return button;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
/** Палитра у пустого цвета без известного значения по умолчанию. */
const UNSET_COLOR = "#808080";

/**
 * Цвет: текстовое поле + штатный выбор цвета. <input type="color"> понимает только #rrggbb;
 * другой формат (например "#000" из импорта) показал бы чёрный и затёр цвет при сохранении —
 * поэтому значением считается текст, а палитра лишь заполняет его.
 * Пустое поле — «не задан»: в поле подсказка «По умолчанию», палитра приглушённо показывает
 * fallback — цвет, который тогда действует (или серый, если он неизвестен), а не чёрный.
 */
export function colorField(current: string, fallback = ""): { element: HTMLElement; value(): string } {
  const text = textInput(current, t("RELGRAPH.Common.ColorDefault"));
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = HEX_COLOR.test(current) ? current : "#000000";
  const syncUnset = () => {
    const empty = text.value.trim() === "";
    picker.classList.toggle("frg-color-unset", empty);
    if (empty) picker.value = HEX_COLOR.test(fallback) ? fallback : UNSET_COLOR;
  };
  picker.addEventListener("input", () => {
    text.value = picker.value;
    picker.classList.remove("frg-color-unset");
  });
  text.addEventListener("input", () => {
    if (HEX_COLOR.test(text.value.trim())) picker.value = text.value.trim();
    syncUnset();
  });
  syncUnset();
  const element = document.createElement("div");
  element.className = "frg-field-row";
  element.append(text, picker);
  return { element, value: () => text.value };
}

/** Штатный FilePicker Foundry для выбора изображения; путь попадает в input (с событием input). */
export function browseImage(input: HTMLInputElement): void {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  const picker = new FilePicker({
    type: "image",
    current: input.value,
    callback: (path: string) => {
      input.value = path;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
  });
  // граф в отдельном окне — выбор файла там же, а не на другом мониторе
  void Promise.resolve(picker.browse()).then(() => adoptIntoPopout(picker));
}

export interface PanelTab {
  label: string;
  content: HTMLElement[];
}

/**
 * Вкладки панели: полоса кнопок между заголовком и телом, в теле видна только выбранная вкладка.
 * Поля всех вкладок остаются в одной форме — «Сохранить» забирает значения со всех сразу.
 */
export function addPanelTabs(shell: PanelShell, tabs: readonly PanelTab[]): void {
  const bar = document.createElement("div");
  bar.className = "frg-panel-tabs";
  const panes = tabs.map((tab) => {
    const pane = document.createElement("div");
    pane.className = "frg-panel-pane";
    pane.id = nextId("frg-pane");
    pane.setAttribute("role", "tabpanel");
    pane.append(...tab.content);
    return pane;
  });
  const buttons = tabs.map((tab, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frg-panel-tab";
    button.textContent = tab.label;
    button.id = nextId("frg-tab");
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", panes[index].id);
    panes[index].setAttribute("aria-labelledby", button.id);
    button.addEventListener("click", () => select(index));
    return button;
  });
  const select = (active: number) => {
    buttons.forEach((button, index) => {
      const selected = index === active;
      button.classList.toggle("frg-panel-tab-active", selected);
      button.setAttribute("aria-selected", String(selected));
      // Tab попадает только на выбранную вкладку, между вкладками — стрелки
      button.tabIndex = selected ? 0 : -1;
    });
    panes.forEach((pane, index) => (pane.hidden = index !== active));
    shell.body.scrollTop = 0;
  };
  bar.setAttribute("role", "tablist");
  bar.addEventListener("keydown", (e) => {
    const current = buttons.indexOf(e.target as HTMLButtonElement);
    if (current < 0) return;
    const last = buttons.length - 1;
    let next: number;
    if (e.key === "ArrowRight") next = current === last ? 0 : current + 1;
    else if (e.key === "ArrowLeft") next = current === 0 ? last : current - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    select(next);
    buttons[next].focus();
  });
  bar.append(...buttons);
  shell.element.insertBefore(bar, shell.body);
  shell.body.append(...panes);
  select(0);
}

/**
 * Группа под общей подписью — для контролов, в которых своих <label> несколько (сегменты):
 * вложенные <label> в HTML недопустимы, поэтому обёртка — <div role="group">.
 */
export function group(label: string, ...controls: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "frg-field";
  wrapper.setAttribute("role", "group");
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = label;
  wrapper.append(caption, ...controls);
  // своей подписи у полей группы нет — каждое названо подписью группы, если не названо иначе
  linkControls(wrapper, caption, controls, false);
  wrapper.setAttribute("aria-labelledby", caption.id);
  return wrapper;
}

export interface SegmentOption<T extends string> {
  value: T;
  /** Подпись; при icon — только всплывающая подсказка и имя для экранных дикторов. */
  label: string;
  /** Класс Font Awesome вместо текста подписи. */
  icon?: string;
}

export interface Segmented<T extends string> {
  element: HTMLElement;
  value(): T;
}

/**
 * Сегменты вместо <select>: радиокнопки (стрелки переключают штатно), у каждой — кнопка-подпись
 * (текст или иконка). Событие change всплывает с выбранного input. className — дополнительный
 * класс раскладки (например, сетка 3×3 выравнивания картинки).
 */
export function segmented<T extends string>(
  options: ReadonlyArray<SegmentOption<T>>,
  current: T,
  className = "",
): Segmented<T> {
  const name = nextId("frg-segment");
  const element = document.createElement("div");
  element.className = `frg-segmented ${className}`.trim();
  element.setAttribute("role", "radiogroup");
  const inputs = options.map((option) => {
    const item = document.createElement("label");
    item.className = "frg-segment";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = option.value === current;
    const caption = document.createElement("span");
    if (option.icon) {
      caption.innerHTML = `<i class="fa-solid ${option.icon}"></i>`;
      item.title = option.label;
      input.setAttribute("aria-label", option.label);
    } else {
      caption.textContent = option.label;
    }
    item.append(input, caption);
    element.append(item);
    return input;
  });
  return {
    element,
    value: () => (inputs.find((input) => input.checked)?.value ?? current) as T,
  };
}
