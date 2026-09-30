/**
 * Общие DOM-кирпичики боковых панелей редактирования (NodePanel, EdgePanel).
 * Панель — обычный <form> в wrapper окна графа (см. GraphApp), без отдельного ApplicationV2.
 */

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

export function createPanelShell(title: string, deleteLabel: string, actions: PanelActions): PanelShell {
  const element = document.createElement("form");
  element.className = "frg-panel";
  element.addEventListener("submit", (e) => {
    e.preventDefault();
    actions.onSave();
  });

  const header = document.createElement("div");
  header.className = "frg-panel-header";
  const heading = document.createElement("div");
  heading.className = "frg-panel-title";
  heading.textContent = title;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "frg-panel-close";
  close.textContent = "×";
  close.title = "Закрыть";
  close.addEventListener("click", () => actions.onClose());
  header.append(heading, close);

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  const footer = document.createElement("div");
  footer.className = "frg-panel-footer";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Сохранить";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "frg-panel-delete";
  remove.textContent = deleteLabel;
  remove.addEventListener("click", () => actions.onDelete());
  footer.append(save, remove);

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

export function textInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
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
