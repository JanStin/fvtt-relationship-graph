/**
 * Панель сведений (пункт «Информация» в меню ПКМ, двойной клик в режиме просмотра) — боковая
 * панель на месте панелей редактирования. Только чтение; содержимое — core/describe.ts.
 * Пока панель открыта, одиночный клик по другому элементу графа показывает его сведения
 * (решает GraphApp).
 */

import type { Description, DescriptionHeader, Portrait } from "../../core/describe";
import { imageAlignPosition } from "../../core/image-align";
import { t } from "../../core/i18n";
import { DEFAULT_NODE_IMG, GM_ONLY_DASH, NEUTRAL_COLOR } from "../graph-renderer";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Миниатюра узла: та же картинка, вписывание и выравнивание, что на графе; рамка — цвет основной фракции. */
function portraitImage(portrait: Portrait, className: string): HTMLImageElement {
  const image = document.createElement("img");
  image.className = `frg-info-portrait ${className}`;
  image.src = portrait.img || DEFAULT_NODE_IMG;
  image.alt = "";
  // значения ImageFit совпадают с CSS object-fit
  image.style.objectFit = portrait.fit;
  const position = imageAlignPosition(portrait.align);
  image.style.objectPosition = `${position.x} ${position.y}`;
  image.style.borderColor = portrait.border ?? NEUTRAL_COLOR;
  return image;
}

/** Линия связи между миниатюрами концов: цвет и штрих типа, стрелка у направленной. */
function edgeLine(header: Extract<DescriptionHeader, { kind: "edge" }>): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "frg-info-edge-line");
  svg.setAttribute("viewBox", "0 0 40 12");
  svg.setAttribute("aria-hidden", "true");
  const color = header.color ?? NEUTRAL_COLOR;
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", "1");
  line.setAttribute("y1", "6");
  line.setAttribute("x2", header.directional ? "32" : "39");
  line.setAttribute("y2", "6");
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", "2");
  const dash = header.dash ?? (header.gmOnly ? GM_ONLY_DASH : null);
  if (dash) line.setAttribute("stroke-dasharray", dash.join(" "));
  svg.append(line);
  if (header.directional) {
    const arrow = document.createElementNS(SVG_NS, "polygon");
    arrow.setAttribute("points", "31,1 39,6 31,11");
    arrow.setAttribute("fill", color);
    svg.append(arrow);
  }
  return svg;
}

/** Картинка слева от имени: портрет, два конца связи или плашка цвета фракции. */
function headerVisual(header: DescriptionHeader): HTMLElement {
  const visual = document.createElement("div");
  visual.className = `frg-info-visual frg-info-visual-${header.kind}`;
  if (header.kind === "node") {
    visual.append(portraitImage(header.portrait, "frg-info-portrait-large"));
  } else if (header.kind === "edge") {
    visual.append(
      portraitImage(header.source, "frg-info-portrait-small"),
      edgeLine(header),
      portraitImage(header.target, "frg-info-portrait-small"),
    );
  } else {
    const swatch = document.createElement("div");
    swatch.className = "frg-info-swatch";
    swatch.style.background = header.color;
    visual.append(swatch);
  }
  return visual;
}

/** Шапка: картинка, имя, тип и роль, крестик. */
function infoHeader(description: Description, onClose: () => void): HTMLElement {
  const header = document.createElement("div");
  header.className = "frg-panel-header frg-info-header";

  const text = document.createElement("div");
  text.className = "frg-info-heading";
  const title = document.createElement("div");
  title.className = "frg-panel-title";
  title.textContent = description.title;
  text.append(title);
  if (description.subtitle) {
    const subtitle = document.createElement("div");
    subtitle.className = "frg-info-subtitle";
    subtitle.textContent = description.subtitle;
    text.append(subtitle);
  }
  if (description.header.kind === "node" && description.header.role) {
    const role = document.createElement("div");
    role.className = "frg-info-role";
    role.textContent = description.header.role;
    text.append(role);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "frg-panel-close";
  close.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
  close.title = t("RELGRAPH.Common.Close");
  close.setAttribute("aria-label", t("RELGRAPH.Common.Close"));
  close.addEventListener("click", () => onClose());

  header.append(headerVisual(description.header), text, close);
  return header;
}

export function createInfoPanel(description: Description, onClose: () => void): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel frg-info-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  for (const row of description.rows) {
    const block = document.createElement("div");
    block.className = "frg-field";
    const label = document.createElement("div");
    label.className = "frg-field-label";
    label.textContent = row.label;
    const value = document.createElement("div");
    value.className = "frg-info-value";
    value.textContent = row.value;
    block.append(label, value);
    body.append(block);
  }

  element.append(infoHeader(description, onClose), body);
  return element;
}
