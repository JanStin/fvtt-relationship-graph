/**
 * Панель фона графа (только GM, в режиме редактирования): цвет, картинка и как её показывать —
 * текстурой или одним изображением в координатах графа. Как и остальные панели — только DOM;
 * применение значений — core/background.ts, сохранение — GraphApp.
 */

import { defaultBackground, type BackgroundEditValues } from "../../core/background";
import type { BackgroundImageMode, GraphBackground } from "../../core/model";
import { browseImage, colorField, createPanelShell, field, hint, select, textInput } from "./form";

const MODE_OPTIONS: ReadonlyArray<{ value: BackgroundImageMode; label: string }> = [
  { value: "single", label: "Общее изображение" },
  { value: "tile", label: "Текстура (плиткой)" },
  { value: "screen", label: "На весь экран (неподвижно)" },
];

export interface BackgroundPanelCallbacks {
  onSave(values: BackgroundEditValues): void;
  /** Вернуть стандартный фон. */
  onReset(): void;
  onClose(): void;
  /**
   * «Вписать в текущий вид»: положение и ширина картинки, при которых она закрывает видимую
   * часть графа. null — картинку не удалось загрузить.
   */
  fitToView(image: string): Promise<{ imageX: number; imageY: number; imageWidth: number } | null>;
}

function numberInput(value: number, step = "any"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  // без длинных хвостов float после «Вписать в вид»
  input.value = String(Math.round(value * 100) / 100);
  return input;
}

/** background === null — фон стандартный. */
export function createBackgroundPanel(background: GraphBackground | null, callbacks: BackgroundPanelCallbacks): HTMLElement {
  const current = background ?? defaultBackground();

  const color = colorField(current.color);

  const image = textInput(current.image);
  image.placeholder = "Без картинки";
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = "Обзор";
  browse.addEventListener("click", () => browseImage(image));
  const imageRow = document.createElement("div");
  imageRow.className = "frg-field-row";
  imageRow.append(image, browse);

  const mode = select(MODE_OPTIONS, current.imageMode);
  const width = numberInput(current.imageWidth, "1");
  width.min = "0";
  const x = numberInput(current.imageX);
  const y = numberInput(current.imageY);
  const opacity = numberInput(Math.round(current.imageOpacity * 100), "1");
  opacity.min = "5";
  opacity.max = "100";

  const fit = document.createElement("button");
  fit.type = "button";
  fit.textContent = "Вписать в текущий вид";
  fit.title = "Картинка закроет видимую часть графа";
  fit.addEventListener("click", () => {
    const path = image.value.trim();
    if (!path) return;
    fit.disabled = true;
    void callbacks
      .fitToView(path)
      .then((placement) => {
        if (!placement) return;
        x.value = String(Math.round(placement.imageX));
        y.value = String(Math.round(placement.imageY));
        width.value = String(Math.round(placement.imageWidth));
      })
      .finally(() => {
        fit.disabled = false;
      });
  });

  const shell = createPanelShell("Фон графа", "Сбросить фон", {
    onSave: () =>
      callbacks.onSave({
        color: color.value(),
        image: image.value,
        imageMode: mode.value as BackgroundImageMode,
        imageX: x.value,
        imageY: y.value,
        imageWidth: width.value,
        imageOpacityPercent: opacity.value,
      }),
    onDelete: callbacks.onReset,
    onClose: callbacks.onClose,
  });

  const positionRow = document.createElement("div");
  positionRow.className = "frg-field-row";
  positionRow.append(x, y);

  // Поля картинки — только когда она задана; ширина — кроме режима «на весь экран»;
  // положение и «вписать» — только у общего изображения.
  const imageFields = [field("Как показывать", mode), field("Непрозрачность, %", opacity)];
  const widthField = field(
    "Ширина (в единицах графа)",
    width,
    hint("0 — натуральный размер файла. У текстуры — ширина одной плитки."),
  );
  const singleFields = [field("Левый верхний угол (X, Y)", positionRow), fit];
  const screenHint = hint("Картинка закрывает всю область графа и не двигается при перемещении и масштабе.");
  const sync = () => {
    const hasImage = image.value.trim() !== "";
    imageFields.forEach((element) => (element.hidden = !hasImage));
    widthField.hidden = !hasImage || mode.value === "screen";
    singleFields.forEach((element) => (element.hidden = !hasImage || mode.value !== "single"));
    screenHint.hidden = !hasImage || mode.value !== "screen";
  };
  image.addEventListener("input", sync);
  mode.addEventListener("change", sync);

  shell.body.append(
    field("Цвет фона", color.element, hint("Пусто — стандартный цвет.")),
    field("Картинка", imageRow),
    imageFields[0],
    screenHint,
    widthField,
    ...singleFields,
    imageFields[1],
    hint("Общее изображение и текстура лежат в координатах графа: двигаются и масштабируются вместе с узлами. Фон видят все."),
  );
  sync();
  return shell.element;
}
