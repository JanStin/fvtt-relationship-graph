/**
 * Панель фона графа (только GM, в режиме редактирования): цвет, картинка и как её показывать —
 * текстурой или одним изображением в координатах графа. Как и остальные панели — только DOM;
 * применение значений — core/background.ts, сохранение — GraphApp.
 */

import { DEFAULT_GRAPH_FONT, defaultBackground, type BackgroundEditValues } from "../../core/background";
import { t } from "../../core/i18n";
import type { BackgroundImageMode, GraphBackground } from "../../core/model";
import { browseImage, colorField, createPanelShell, field, hint, select, textInput } from "./form";

function modeOptions(): Array<{ value: BackgroundImageMode; label: string }> {
  return [
    { value: "single", label: t("RELGRAPH.Background.ModeImage") },
    { value: "tile", label: t("RELGRAPH.Background.ModeTile") },
    { value: "screen", label: t("RELGRAPH.Background.ModeScreen") },
  ];
}

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

/**
 * Выбор шрифта подписей: '' — по умолчанию (Signika). Каждый пункт показан своим шрифтом.
 * Шрифт, которого нет в списке (например, удалённый из настроек мира), всё равно остаётся выбранным.
 */
function fontSelect(fonts: readonly string[], current: string): HTMLSelectElement {
  const names = [...new Set(fonts.filter((name) => name && name !== DEFAULT_GRAPH_FONT))];
  if (current && current !== DEFAULT_GRAPH_FONT && !names.includes(current)) names.unshift(current);
  const element = select(
    [{ value: "", label: t("RELGRAPH.Background.FontDefault", { font: DEFAULT_GRAPH_FONT }) }, ...names.map((name) => ({ value: name, label: name }))],
    current === DEFAULT_GRAPH_FONT ? "" : current,
  );
  [...element.options].forEach((option) => {
    option.style.fontFamily = `"${option.value || DEFAULT_GRAPH_FONT}"`;
  });
  return element;
}

/**
 * background === null — фон стандартный. fonts — шрифты для выбора: шрифты Foundry, затем
 * системные (повторы и Signika отбрасываются).
 */
export function createBackgroundPanel(
  background: GraphBackground | null,
  fonts: readonly string[],
  callbacks: BackgroundPanelCallbacks,
): HTMLElement {
  const current = background ?? defaultBackground();
  const font = fontSelect(fonts, current.font ?? "");

  const color = colorField(current.color);

  const image = textInput(current.image);
  image.placeholder = t("RELGRAPH.Background.NoImage");
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = t("RELGRAPH.Common.Browse");
  browse.addEventListener("click", () => browseImage(image));
  const imageRow = document.createElement("div");
  imageRow.className = "frg-field-row";
  imageRow.append(image, browse);

  const mode = select(modeOptions(), current.imageMode);
  const width = numberInput(current.imageWidth, "1");
  width.min = "0";
  const x = numberInput(current.imageX);
  const y = numberInput(current.imageY);
  const opacity = numberInput(Math.round(current.imageOpacity * 100), "1");
  opacity.min = "5";
  opacity.max = "100";

  const fit = document.createElement("button");
  fit.type = "button";
  fit.textContent = t("RELGRAPH.Background.FitToView");
  fit.title = t("RELGRAPH.Background.FitToViewHint");
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

  const shell = createPanelShell(t("RELGRAPH.Background.Panel"), t("RELGRAPH.Background.Reset"), {
    onSave: () =>
      callbacks.onSave({
        color: color.value(),
        image: image.value,
        imageMode: mode.value as BackgroundImageMode,
        imageX: x.value,
        imageY: y.value,
        imageWidth: width.value,
        imageOpacityPercent: opacity.value,
        font: font.value,
      }),
    onDelete: callbacks.onReset,
    onClose: callbacks.onClose,
  });

  const positionRow = document.createElement("div");
  positionRow.className = "frg-field-row";
  positionRow.append(x, y);

  // Поля картинки — только когда она задана; ширина — кроме режима «на весь экран»;
  // положение и «вписать» — только у общего изображения.
  const imageFields = [field(t("RELGRAPH.Background.Mode"), mode), field(t("RELGRAPH.Background.Opacity"), opacity)];
  const widthField = field(
    t("RELGRAPH.Background.Width"),
    width,
    hint(t("RELGRAPH.Background.WidthHint")),
  );
  const singleFields = [field(t("RELGRAPH.Background.Position"), positionRow), fit];
  const screenHint = hint(t("RELGRAPH.Background.ScreenHint"));
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
    field(t("RELGRAPH.Background.Color"), color.element, hint(t("RELGRAPH.Background.ColorHint"))),
    field(t("RELGRAPH.Background.Image"), imageRow),
    imageFields[0],
    screenHint,
    widthField,
    ...singleFields,
    imageFields[1],
    hint(t("RELGRAPH.Background.ModeHint")),
    field(
      t("RELGRAPH.Background.Font"),
      font,
      hint(t("RELGRAPH.Background.FontHint")),
    ),
  );
  sync();
  return shell.element;
}
