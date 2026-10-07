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
  close.textContent = "×";
  close.title = t("RELGRAPH.Common.Close");
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

/** Подпись + контрол(ы) в одну вертикальную группу. */
export function field(label: string, ...controls: HTMLElement[]): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "frg-field";
  const caption = document.createElement("span");
  caption.className = "frg-field-label";
  caption.textContent = label;
  wrapper.append(caption, ...controls);
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

/**
 * Цвет: текстовое поле + штатный выбор цвета. <input type="color"> понимает только #rrggbb;
 * другой формат (например "#000" из импорта) показал бы чёрный и затёр цвет при сохранении —
 * поэтому значением считается текст, а палитра лишь заполняет его.
 */
export function colorField(current: string): { element: HTMLElement; value(): string } {
  const text = textInput(current);
  const picker = document.createElement("input");
  picker.type = "color";
  picker.value = HEX_COLOR.test(current) ? current : "#000000";
  picker.addEventListener("input", () => {
    text.value = picker.value;
  });
  text.addEventListener("input", () => {
    if (HEX_COLOR.test(text.value.trim())) picker.value = text.value.trim();
  });
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
    pane.append(...tab.content);
    return pane;
  });
  const buttons = tabs.map((tab, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frg-panel-tab";
    button.textContent = tab.label;
    button.addEventListener("click", () => select(index));
    return button;
  });
  const select = (active: number) => {
    buttons.forEach((button, index) => button.classList.toggle("frg-panel-tab-active", index === active));
    panes.forEach((pane, index) => (pane.hidden = index !== active));
    shell.body.scrollTop = 0;
  };
  bar.append(...buttons);
  shell.element.insertBefore(bar, shell.body);
  shell.body.append(...panes);
  select(0);
}
