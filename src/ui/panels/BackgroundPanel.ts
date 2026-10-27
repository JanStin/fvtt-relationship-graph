/**
 * Панель фона графа (только GM, в режиме редактирования): цвет, картинка и как её показывать —
 * текстурой или одним изображением в координатах графа; шрифт подписей, вид дополнительных
 * фракций и цвет панели инструментов. Две вкладки: «Фон» и «Вид». Как и остальные панели — только
 * DOM; применение значений — core/background.ts, сохранение и предпросмотр — GraphApp.
 */

import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_GRAPH_FONT,
  DEFAULT_TOOLBAR_COLOR,
  defaultBackground,
  factionBlendOf,
  factionDisplayOf,
  type BackgroundEditValues,
} from "../../core/background";
import { t } from "../../core/i18n";
import { parseUiTheme, UI_THEMES, uiThemeToolbarColor } from "../../core/ui-theme";
import type { BackgroundImageMode, FactionBlend, FactionDisplay, GraphBackground } from "../../core/model";
import { addPanelTabs, browseImage, checkbox, colorField, createPanelShell, field, group, hint, segmented, select, textInput } from "./form";

/** Задержка живого предпросмотра после правки поля. */
const PREVIEW_DELAY_MS = 120;

function modeOptions(): Array<{ value: BackgroundImageMode; label: string }> {
  return [
    { value: "single", label: t("RELGRAPH.Background.ModeImage") },
    { value: "tile", label: t("RELGRAPH.Background.ModeTile") },
    { value: "screen", label: t("RELGRAPH.Background.ModeScreen") },
  ];
}

function factionDisplayOptions(): Array<{ value: FactionDisplay; label: string }> {
  return [
    { value: "badges", label: t("RELGRAPH.Background.FactionDisplayBadges") },
    { value: "areas", label: t("RELGRAPH.Background.FactionDisplayAreas") },
  ];
}

function factionBlendOptions(): Array<{ value: FactionBlend; label: string }> {
  return [
    { value: "overlay", label: t("RELGRAPH.Background.FactionBlendOverlay") },
    { value: "mix", label: t("RELGRAPH.Background.FactionBlendMix") },
  ];
}

const UI_THEME_LABELS: Record<(typeof UI_THEMES)[number], string> = {
  "": "RELGRAPH.Background.UiThemeDefault",
  parchment: "RELGRAPH.Background.UiThemeParchment",
  frost: "RELGRAPH.Background.UiThemeFrost",
  night: "RELGRAPH.Background.UiThemeNight",
  forest: "RELGRAPH.Background.UiThemeForest",
  ash: "RELGRAPH.Background.UiThemeAsh",
  crimson: "RELGRAPH.Background.UiThemeCrimson",
  abyss: "RELGRAPH.Background.UiThemeAbyss",
};

export interface BackgroundPanelCallbacks {
  onSave(values: BackgroundEditValues): void;
  /** Вернуть стандартный фон, шрифт, вид фракций и цвет панели инструментов (отменяется Ctrl+Z). */
  onReset(): void;
  onClose(): void;
  /**
   * Живой предпросмотр несохранённых значений (цвета, картинка, непрозрачность, смешение).
   * Откат к сохранённому — забота GraphApp при закрытии панели без сохранения.
   */
  onPreview(values: BackgroundEditValues): void;
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

/** Ползунок непрозрачности (5–100 %) с числом рядом. */
function opacitySlider(percent: number): { element: HTMLElement; input: HTMLInputElement } {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "5";
  input.max = "100";
  input.step = "1";
  input.value = String(Math.round(percent));
  const output = document.createElement("output");
  output.className = "frg-range-value";
  const show = () => (output.textContent = `${input.value} %`);
  input.addEventListener("input", show);
  show();
  const element = document.createElement("div");
  element.className = "frg-field-row frg-range";
  element.append(input, output);
  return { element, input };
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
  const factionDisplay = segmented(factionDisplayOptions(), factionDisplayOf(current));
  const factionBlend = segmented(factionBlendOptions(), factionBlendOf(current));

  const color = colorField(current.color, DEFAULT_BACKGROUND_COLOR);
  const toolbarColor = colorField(current.toolbarColor ?? "", DEFAULT_TOOLBAR_COLOR);
  const uiTheme = select(
    UI_THEMES.map((value) => ({ value, label: t(UI_THEME_LABELS[value]) })),
    parseUiTheme(current.uiTheme),
  );
  // пустой цвет панели инструментов — цвет набора; выбор набора сбрасывает свой цвет, иначе он
  // перекрывал бы набор и панель инструментов осталась бы прежней
  const themeToolbarColor = () => uiThemeToolbarColor(parseUiTheme(uiTheme.value)) ?? DEFAULT_TOOLBAR_COLOR;
  toolbarColor.setFallback(themeToolbarColor());
  uiTheme.addEventListener("change", () => {
    toolbarColor.setFallback(themeToolbarColor());
    toolbarColor.clear();
  });

  const image = textInput(current.image);
  image.placeholder = t("RELGRAPH.Background.NoImage");
  const browse = document.createElement("button");
  browse.type = "button";
  browse.textContent = t("RELGRAPH.Common.Browse");
  browse.addEventListener("click", () => browseImage(image));
  const imageRow = document.createElement("div");
  imageRow.className = "frg-field-row";
  imageRow.append(image, browse);

  const mode = segmented(modeOptions(), current.imageMode);
  const opacity = opacitySlider(current.imageOpacity * 100);

  // ширина 0 — натуральный размер файла: явным флажком, поле ширины при нём выключено
  const width = numberInput(current.imageWidth, "1");
  width.min = "1";
  width.setAttribute("aria-label", t("RELGRAPH.Background.Width"));
  const natural = checkbox(t("RELGRAPH.Background.NaturalSize"), current.imageWidth <= 0);
  const syncNatural = () => {
    width.disabled = natural.input.checked;
    if (natural.input.checked) width.value = "";
  };
  natural.input.addEventListener("change", () => {
    syncNatural();
    if (!natural.input.checked) width.focus();
  });
  syncNatural();

  const x = numberInput(current.imageX);
  const y = numberInput(current.imageY);
  x.setAttribute("aria-label", "X");
  y.setAttribute("aria-label", "Y");

  const fitLabel = `${t("RELGRAPH.Background.FitToView")}: ${t("RELGRAPH.Background.FitToViewHint")}`;
  const fit = document.createElement("button");
  fit.type = "button";
  fit.className = "frg-icon-button";
  fit.innerHTML = `<i class="fa-solid fa-expand"></i>`;
  fit.title = fitLabel;
  fit.setAttribute("aria-label", fitLabel);

  const values = (): BackgroundEditValues => ({
    color: color.value(),
    image: image.value,
    imageMode: mode.value(),
    imageX: x.value,
    imageY: y.value,
    imageWidth: natural.input.checked ? "0" : width.value,
    imageOpacityPercent: opacity.input.value,
    font: font.value,
    factionDisplay: factionDisplay.value(),
    factionBlend: factionBlend.value(),
    toolbarColor: toolbarColor.value(),
    uiTheme: uiTheme.value,
  });

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
        natural.input.checked = false;
        syncNatural();
        width.value = String(Math.round(placement.imageWidth));
        callbacks.onPreview(values());
      })
      .finally(() => {
        fit.disabled = false;
      });
  });

  const shell = createPanelShell(t("RELGRAPH.Background.Panel"), t("RELGRAPH.Background.Reset"), {
    onSave: () => callbacks.onSave(values()),
    onDelete: callbacks.onReset,
    onClose: callbacks.onClose,
  });

  const positionRow = document.createElement("div");
  positionRow.className = "frg-field-row";
  positionRow.append(x, y, fit);
  const widthRow = document.createElement("div");
  widthRow.className = "frg-field-row frg-width-row";
  widthRow.append(width, natural.row);

  // Поля картинки — только когда она задана; ширина и подсказка про координаты графа — кроме
  // режима «на весь экран» (у него своя подсказка); положение — только у общего изображения.
  const modeField = group(t("RELGRAPH.Background.Mode"), mode.element);
  const opacityField = field(t("RELGRAPH.Background.Opacity"), opacity.element);
  const modeHint = hint(t("RELGRAPH.Background.ModeHint"));
  const screenHint = hint(t("RELGRAPH.Background.ScreenHint"));
  const widthField = group(t("RELGRAPH.Background.Width"), widthRow, hint(t("RELGRAPH.Background.WidthHint")));
  const positionField = group(t("RELGRAPH.Background.Position"), positionRow);
  // цвет перекрытия важен только для областей дополнительных фракций; скрытое поле сохраняет
  // своё значение — при возврате к «Областями» оно вернётся
  const factionBlendField = group(
    t("RELGRAPH.Background.FactionBlend"),
    factionBlend.element,
    hint(t("RELGRAPH.Background.FactionBlendHint")),
  );
  const sync = () => {
    const hasImage = image.value.trim() !== "";
    const imageMode = mode.value();
    modeField.hidden = !hasImage;
    opacityField.hidden = !hasImage;
    modeHint.hidden = !hasImage || imageMode === "screen";
    screenHint.hidden = !hasImage || imageMode !== "screen";
    widthField.hidden = !hasImage || imageMode === "screen";
    positionField.hidden = !hasImage || imageMode !== "single";
    factionBlendField.hidden = factionDisplay.value() !== "areas";
  };
  image.addEventListener("input", sync);
  mode.element.addEventListener("change", sync);
  factionDisplay.element.addEventListener("change", sync);

  addPanelTabs(shell, [
    {
      label: t("RELGRAPH.Background.TabBackground"),
      content: [
        field(t("RELGRAPH.Background.Color"), color.element, hint(t("RELGRAPH.Background.ColorHint"))),
        field(t("RELGRAPH.Background.Image"), imageRow),
        modeField,
        opacityField,
        modeHint,
        screenHint,
        widthField,
        positionField,
      ],
    },
    {
      label: t("RELGRAPH.Background.TabView"),
      content: [
        field(t("RELGRAPH.Background.Font"), font, hint(t("RELGRAPH.Background.FontHint"))),
        group(
          t("RELGRAPH.Background.FactionDisplay"),
          factionDisplay.element,
          hint(t("RELGRAPH.Background.FactionDisplayHint")),
        ),
        factionBlendField,
        field(t("RELGRAPH.Background.UiTheme"), uiTheme, hint(t("RELGRAPH.Background.UiThemeHint"))),
        field(t("RELGRAPH.Background.ToolbarColor"), toolbarColor.element, hint(t("RELGRAPH.Background.ToolbarColorHint"))),
      ],
    },
  ]);
  sync();

  // предпросмотр — на любую правку формы; шрифт и вид фракций в нём не участвуют (см. GraphApp).
  // С задержкой: путь к картинке печатается по букве, и каждая буква грузила бы файл. Панель,
  // закрытую за время задержки, не трогаем — GraphApp уже вернул сохранённый фон.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const preview = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (shell.element.isConnected) callbacks.onPreview(values());
    }, PREVIEW_DELAY_MS);
  };
  shell.element.addEventListener("input", preview);
  shell.element.addEventListener("change", preview);
  return shell.element;
}
