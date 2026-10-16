/**
 * Панель сведений (пункт «Информация» в меню ПКМ, двойной клик в режиме просмотра) — боковая
 * панель на месте панелей редактирования. Только чтение; содержимое — core/describe.ts.
 * Пока панель открыта, одиночный клик по другому элементу графа показывает его сведения
 * (решает GraphApp). Связи, участники фракции и фракции узла — кнопки: клик открывает сведения
 * о них, наведение на связь подсвечивает её и узел на графе.
 */

import type {
  Description,
  DescriptionBlock,
  DescriptionHeader,
  InfoChip,
  InfoLink,
  InfoLinkGroup,
  InfoTarget,
  Portrait,
} from "../../core/describe";
import { imageAlignPosition } from "../../core/image-align";
import { t } from "../../core/i18n";
import { DEFAULT_NODE_IMG, GM_ONLY_DASH, NEUTRAL_COLOR } from "../graph-renderer";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface InfoPanelActions {
  onClose(): void;
  /** Клик по связи, участнику, концу связи или чипу фракции. */
  onOpen(target: InfoTarget): void;
  /** Наведение на строку-ссылку: подсветить узел и связь; null — снять подсветку. */
  onHover(link: { nodeId: string; edgeId: string | null } | null): void;
}

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

/** Штрих линии как на графе: свой у типа, иначе пунктир gmOnly-связи, иначе сплошная. */
function strokeDash(dash: number[] | null, gmOnly: boolean): string | null {
  const pattern = dash ?? (gmOnly ? GM_ONLY_DASH : null);
  return pattern ? pattern.join(" ") : null;
}

/** Горизонтальная линия связи (svg); arrow — со стрелкой на конце. */
function strokeLine(className: string, width: number, color: string | null, dash: string | null, arrow: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", `0 0 ${width} 12`);
  svg.setAttribute("aria-hidden", "true");
  const stroke = color ?? NEUTRAL_COLOR;
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", "1");
  line.setAttribute("y1", "6");
  line.setAttribute("x2", String(arrow ? width - 8 : width - 1));
  line.setAttribute("y2", "6");
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "2");
  if (dash) line.setAttribute("stroke-dasharray", dash);
  svg.append(line);
  if (arrow) {
    const head = document.createElementNS(SVG_NS, "polygon");
    head.setAttribute("points", `${width - 9},1 ${width - 1},6 ${width - 9},11`);
    head.setAttribute("fill", stroke);
    svg.append(head);
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
      strokeLine("frg-info-edge-line", 40, header.color, strokeDash(header.dash, header.gmOnly), header.directional),
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

function icon(classes: string): HTMLElement {
  const element = document.createElement("i");
  element.className = classes;
  element.setAttribute("aria-hidden", "true");
  return element;
}

/** Шапка: картинка, имя, тип и роль, значок видимости, крестик. */
function infoHeader(description: Description, onClose: () => void): HTMLElement {
  const header = document.createElement("div");
  header.className = "frg-panel-header frg-info-header";

  const text = document.createElement("div");
  text.className = "frg-info-heading";
  const title = document.createElement("div");
  title.className = "frg-panel-title";
  title.textContent = description.title;
  if (description.visibility) {
    const badge = document.createElement("span");
    badge.className = "frg-info-visibility";
    badge.title = description.visibility.label;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", description.visibility.label);
    badge.append(icon(`fa-solid ${description.visibility.icon}`));
    title.append(" ", badge);
  }
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

const DIRECTION_ICONS = { out: "fa-arrow-right", in: "fa-arrow-left", none: "fa-minus" } as const;
const DIRECTION_LABELS = { out: "RELGRAPH.Info.Outgoing", in: "RELGRAPH.Info.Incoming", none: "RELGRAPH.Info.Undirected" } as const;

/** Миниатюра в строке участника или конца связи — как в результатах поиска. */
function linkThumb(portrait: Portrait): HTMLImageElement {
  const image = document.createElement("img");
  image.className = "frg-search-thumb";
  image.src = portrait.img || DEFAULT_NODE_IMG;
  image.alt = "";
  image.style.objectFit = portrait.fit;
  const position = imageAlignPosition(portrait.align);
  image.style.objectPosition = `${position.x} ${position.y}`;
  return image;
}

/** Имя и роль под ним — текст строки участника. */
function memberText(link: InfoLink): HTMLElement {
  const info = document.createElement("span");
  info.className = "frg-search-info";
  const name = document.createElement("span");
  name.className = "frg-search-name";
  name.textContent = link.label;
  info.append(name);
  if (link.caption) {
    const role = document.createElement("span");
    role.className = "frg-field-hint";
    role.textContent = link.caption;
    info.append(role);
  }
  return info;
}

/** Полоска типа, направление, имя и подпись в строку — содержимое строки связи. */
function connectionContent(link: InfoLink): Element[] {
  const content: Element[] = [];
  if (link.stroke) {
    content.push(strokeLine("frg-info-link-stroke", 18, link.stroke.color, strokeDash(link.stroke.dash, link.stroke.gmOnly), false));
    const direction = document.createElement("span");
    direction.className = "frg-info-link-direction";
    direction.title = t(DIRECTION_LABELS[link.direction]);
    direction.setAttribute("role", "img");
    direction.setAttribute("aria-label", t(DIRECTION_LABELS[link.direction]));
    direction.append(icon(`fa-solid ${DIRECTION_ICONS[link.direction]}`));
    content.push(direction);
  }
  const name = document.createElement("span");
  name.className = "frg-info-link-name";
  name.textContent = link.label;
  content.push(name);
  if (link.caption) {
    const caption = document.createElement("span");
    caption.className = "frg-info-link-caption";
    caption.textContent = link.caption;
    content.push(caption);
  }
  return content;
}

/**
 * Строка-ссылка на узел. Связь — полоска типа, направление, имя, подпись в строку; участник
 * фракции и конец связи — миниатюра, справа имя, под ним роль (как в поиске).
 */
function linkRow(link: InfoLink, actions: InfoPanelActions): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "frg-info-link";
  if (link.portrait) {
    button.classList.add("frg-info-link-member");
    button.append(linkThumb(link.portrait), memberText(link));
  } else {
    button.append(...connectionContent(link));
  }

  const hover = { nodeId: link.nodeId, edgeId: link.edgeId };
  button.addEventListener("click", () => actions.onOpen({ kind: "node", id: link.nodeId }));
  button.addEventListener("mouseenter", () => actions.onHover(hover));
  button.addEventListener("mouseleave", () => actions.onHover(null));
  button.addEventListener("focus", () => actions.onHover(hover));
  button.addEventListener("blur", () => actions.onHover(null));
  return button;
}

function linkList(links: readonly InfoLink[], actions: InfoPanelActions): HTMLElement {
  const list = document.createElement("div");
  list.className = "frg-info-links";
  list.append(...links.map((link) => linkRow(link, actions)));
  return list;
}

/** Группа связей одного типа: заголовок-кнопка (цвет, название, счётчик) сворачивает список. */
function linkGroup(group: InfoLinkGroup, actions: InfoPanelActions): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "frg-info-group";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "frg-info-group-toggle";
  toggle.setAttribute("aria-expanded", "true");
  const caret = icon("fa-solid fa-chevron-down frg-info-caret");
  const dot = document.createElement("span");
  dot.className = "frg-info-dot";
  dot.style.background = group.color ?? NEUTRAL_COLOR;
  const label = document.createElement("span");
  label.className = "frg-info-group-label";
  label.textContent = group.label;
  const count = document.createElement("span");
  count.className = "frg-info-count";
  count.textContent = String(group.links.length);
  toggle.append(caret, dot, label, count);

  const list = linkList(group.links, actions);
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    list.hidden = expanded;
  });
  wrapper.append(toggle, list);
  return wrapper;
}

/** Чип: фракция (кружок цвета, кнопка — её сведения) или состояние (иконка). */
function chip(item: InfoChip, actions: InfoPanelActions): HTMLElement {
  const element = document.createElement(item.target ? "button" : "span");
  element.className = "frg-info-chip";
  if (element instanceof HTMLButtonElement) element.type = "button";
  if (item.color) {
    const dot = document.createElement("span");
    dot.className = "frg-info-dot";
    dot.style.background = item.color;
    element.append(dot);
  }
  if (item.icon) element.append(icon(`${item.icon} frg-info-chip-icon`));
  const label = document.createElement("span");
  label.textContent = item.label;
  element.append(label);
  if (item.primary) {
    element.classList.add("frg-info-chip-primary");
    element.append(icon("fa-solid fa-star frg-info-chip-icon"));
    element.title = t("RELGRAPH.Info.PrimaryFaction");
    element.setAttribute("aria-label", `${item.label} — ${t("RELGRAPH.Info.PrimaryFaction")}`);
  }
  const target = item.target;
  if (target) element.addEventListener("click", () => actions.onOpen(target));
  return element;
}

function block(item: DescriptionBlock, actions: InfoPanelActions): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `frg-field frg-info-block frg-info-block-${item.kind}`;
  const label = document.createElement("div");
  label.className = "frg-field-label";
  label.textContent = item.label;
  wrapper.append(label);

  if (item.kind === "text") {
    const value = document.createElement("div");
    value.className = "frg-info-value";
    value.textContent = item.text;
    wrapper.append(value);
  } else if (item.kind === "chips") {
    const chips = document.createElement("div");
    chips.className = "frg-info-chips";
    chips.append(...item.chips.map((c) => chip(c, actions)));
    wrapper.append(chips);
  } else if (item.groups) {
    wrapper.append(...item.groups.map((group) => linkGroup(group, actions)));
  } else {
    wrapper.append(linkList(item.links, actions));
  }
  return wrapper;
}

export function createInfoPanel(description: Description, actions: InfoPanelActions): HTMLElement {
  const element = document.createElement("div");
  element.className = "frg-panel frg-info-panel";

  const body = document.createElement("div");
  body.className = "frg-panel-body";
  body.append(...description.blocks.map((item) => block(item, actions)));

  if (description.empty) {
    const empty = document.createElement("div");
    empty.className = "frg-info-empty";
    const text = document.createElement("p");
    text.textContent = t("RELGRAPH.Info.Empty");
    empty.append(text);
    if (description.empty.hint) {
      const hint = document.createElement("p");
      hint.className = "frg-field-hint";
      hint.textContent = description.empty.hint;
      empty.append(hint);
    }
    body.append(empty);
  }

  element.append(infoHeader(description, actions.onClose), body);
  return element;
}
