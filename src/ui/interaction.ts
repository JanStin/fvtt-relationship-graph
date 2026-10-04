/**
 * Подключает уже проверенную (спайк S3) логику resize/drag/separation
 * к реальным событиям Cytoscape. core/layout.ts и core/selection.ts ничего не знают про
 * Cytoscape — вся стыковка с DOM/событиями здесь.
 *
 * Схема управления (см. docs/controls.md):
 *   колесо               — масштаб вида (нативно Cytoscape)
 *   зажатое колесо       — панорамирование вида (здесь)
 *   Alt+колесо           — resize выделенных узлов, а без выделения — узла под курсором (здесь)
 *
 * pinned-узлы (data.pinned, ставит graph-renderer.ts; у игрока — gmOnly) не перетаскиваются
 * (grabbable: false — Cytoscape исключает их и из группового drag), не ресайзятся и не
 * сдвигаются сепарацией.
 *   ЛКМ по узлу          — выделение и перетаскивание, выделенные двигаются группой (нативно)
 *   ЛКМ мимо узла        — панорамирование, в том числе по области фракции: области
 *                          "прозрачны" для мыши, см. graph-renderer.ts (нативно)
 *   Shift+ЛКМ            — добавить узел к выделению / рамка выделения (нативно)
 *   Ctrl+ЛКМ             — панорамирование независимо от того, что под курсором (здесь)
 *   Alt+ЛКМ              — выбор области: выделяются все узлы фракции (здесь)
 *   двойной клик ЛКМ     — по узлу/связи/области (callback onInfo): в просмотре — информация,
 *                          в режиме редактирования — панель редактирования (решает GraphApp)
 *   ПКМ                  — контекстное меню (callback onContextMenu)
 *   S+ЛКМ по узлу        — быстрое создание связи: начать от узла / завершить на узле; если
 *                          выделен один другой узел — связь сразу от него к нажатому (здесь)
 *   Esc                  — отменить создание связи / снять выделение
 *   Delete               — удалить выделенное (callback onDeleteSelected)
 *   Ctrl+Z / Ctrl+Y      — отмена / повтор (callbacks onUndo/onRedo); Ctrl+Shift+Z — тоже повтор
 *
 * Создание связи (startLinking): пока режим активен, клик по другому узлу завершает выбор
 * (callback onLinkPicked), Esc или ПКМ — отменяют; сверху висит подсказка.
 *
 * Сами меню и карточка информации — в overlays.ts, наполняет их GraphApp: этот файл
 * ничего не знает про GraphData.
 */

import type cytoscape from "cytoscape";
import { findBlobAt } from "../core/blob";
import { clientToModel, type Point } from "../core/hit-test";
import { t } from "../core/i18n";
import { separateOverlaps, type PositionedCircle } from "../core/layout";
import { groupScale, SCALE_MAX, SCALE_MIN } from "../core/selection";
import {
  BASE_SIZE,
  FACTION_SELECTED_CLASS,
  factionElementId,
  factionIdFromElement,
  LINK_SOURCE_CLASS,
} from "./graph-renderer";
import { factionBlobGroups } from "./faction-blobs";

const SCALE_STEP = 0.1;
const SEPARATION_GAP = 8;
const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;

/** Что оказалось под курсором. id фракции — из GraphData (без префикса элемента Cytoscape). */
export type GraphTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "faction"; id: string }
  | { kind: "background" };

export interface NodeSnapshot {
  id: string;
  x: number;
  y: number;
  scale: number;
}

export interface InteractionCallbacks {
  /** Снэпшот всех обычных (не-фракционных) узлов после каждого commit-события (resize, dragfree). */
  onNodesChanged(nodes: NodeSnapshot[]): void;
  /** ПКМ. client — clientX/clientY события мыши. */
  onContextMenu(target: GraphTarget, client: Point): void;
  /** Двойной клик ЛКМ по узлу, связи или области. */
  onInfo(target: GraphTarget, client: Point): void;
  /** S+ЛКМ по узлу вне режима создания связи. Начинать ли режим (startLinking) — решает получатель. */
  onQuickLink(nodeId: string): void;
  /** В режиме создания связи выбран второй узел. */
  onLinkPicked(sourceId: string, targetId: string): void;
  /** Delete: выделенные обычные узлы и связи (что из них можно удалить — решает получатель). */
  onDeleteSelected(nodeIds: string[], edgeIds: string[]): void;
  /** Ctrl+Z / Ctrl+Y (и Ctrl+Shift+Z). */
  onUndo(): void;
  onRedo(): void;
}

export interface InteractionOptions {
  /**
   * false — режим просмотра: без resize, создания связей и перетаскивания (последнее
   * отключает graph-renderer.ts через autoungrabify). Выделение, панорамирование, меню и
   * карточки работают.
   */
  editable: boolean;
}

export interface InteractionHandle {
  /** Вызвать сразу после создания cytoscape(...) на том же container. */
  bind(cy: cytoscape.Core): void;
  /** Возвращает узлу scale = 1.0 (группе выделенных — пропорционально, как Alt+колесо). pinned-узлы не трогает. */
  resetScale(nodeId: string): void;
  /** Выделяет все узлы области (то же, что Alt+ЛКМ по ней). */
  selectFaction(factionId: string): void;
  /** Включает режим создания связи от узла: следующий клик по другому узлу — onLinkPicked. */
  startLinking(sourceId: string): void;
  /** Раздвигает соседей вокруг узла (после смены размера/фракции извне) и сообщает позиции через onNodesChanged. */
  settle(nodeId: string): void;
  teardown(): void;
}

function snapshotNodes(cy: cytoscape.Core): NodeSnapshot[] {
  return cy.nodes("[!isFaction]").map((n) => ({
    id: n.id(),
    x: n.position().x,
    y: n.position().y,
    scale: n.data("scale") as number,
  }));
}

/** Группа для операции: если под курсором/перетаскиваемый узел выделен и выделено >1 — вся группа, иначе только он. */
function resolveGroup(cy: cytoscape.Core, node: cytoscape.NodeSingular): cytoscape.NodeCollection {
  const selected = cy.$("node[!isFaction]:selected") as cytoscape.NodeCollection;
  return node.selected() && selected.length > 1 ? selected : node;
}

/** Узлы, которые пользователь может двигать и ресайзить (без pinned — см. graph-renderer.ts). */
function movable(nodes: cytoscape.NodeCollection): cytoscape.NodeCollection {
  return nodes.filter((n) => n.data("pinned") !== true);
}

/**
 * Раздвигает узлы после resize/drag: anchored — только что изменённая группа, остальные могут
 * подвинуться. pinned-узлы (у игрока — gmOnly) тоже закреплены: сепарация их не сдвигает.
 */
function runSeparation(cy: cytoscape.Core, anchored: cytoscape.NodeCollection): void {
  const regularNodes = cy.nodes("[!isFaction]");
  const circles: PositionedCircle[] = regularNodes.map((n) => ({
    id: n.id(),
    x: n.position().x,
    y: n.position().y,
    radius: (n.data("size") as number) / 2,
  }));

  const anchoredIds = new Set([...anchored.map((n) => n.id()), ...regularNodes.filter("[?pinned]").map((n) => n.id())]);
  const result = separateOverlaps(circles, { anchoredIds, gap: SEPARATION_GAP });

  result.positions.forEach((pos, id) => {
    cy.getElementById(id).position(pos);
  });
}

/**
 * Регистрирует обработчики на container и (после bind()) на cy.
 *
 * ВАЖНО про перехват событий у Cytoscape: она вешает свой wheel-обработчик на тот же container
 * тоже с capture:true (см. cytoscape.esm.mjs, registerBinding(r.container, 'wheel', wheelHandler, true)).
 * Чтобы она не увидела событие, нужны ОБА условия:
 *   1. setupInteraction(container, ...) вызывается ДО cytoscape({container, ...}) — листенеры
 *      одного элемента срабатывают в порядке регистрации;
 *   2. stopImmediatePropagation(), а не stopPropagation(): последний останавливает только путь
 *      к другим элементам, а остальные листенеры того же элемента всё равно вызываются.
 * Раньше выполнялось только первое — поэтому Alt+wheel ресайзил узел и одновременно зумил
 * всю сцену.
 */
export function setupInteraction(
  container: HTMLElement,
  callbacks: InteractionCallbacks,
  options: InteractionOptions,
): InteractionHandle {
  const { editable } = options;
  let cy: cytoscape.Core | null = null;
  let hoveredNodeId: string | null = null;
  let pointerInside = false;
  let linkSourceId: string | null = null;
  let linkHint: HTMLElement | null = null;

  /** Клик по узлу в режиме создания связи. Клик по самому источнику игнорируется. */
  function pickLinkTarget(targetId: string): void {
    if (linkSourceId === null || targetId === linkSourceId) return;
    const sourceId = linkSourceId;
    endLinking();
    callbacks.onLinkPicked(sourceId, targetId);
  }

  function endLinking(): void {
    if (linkSourceId !== null) regularNode(linkSourceId)?.removeClass(LINK_SOURCE_CLASS);
    linkSourceId = null;
    linkHint?.remove();
    linkHint = null;
    container.style.cursor = "";
  }

  function regularNode(id: string | null): cytoscape.NodeSingular | null {
    if (!cy || id === null) return null;
    const node = cy.getElementById(id) as cytoscape.NodeSingular;
    return node.empty() ? null : node;
  }

  /**
   * Масштабирует группу пропорционально: target получает requestedScale, остальные — тот же коэффициент.
   * pinned-узлы из группы выпадают; если target среди них — масштаб отсчитывается от первого подвижного.
   */
  function resizeGroup(
    requestedGroup: cytoscape.NodeCollection,
    requestedTarget: cytoscape.NodeSingular,
    requestedScale: number,
  ): void {
    if (!cy) return;
    const group = movable(requestedGroup);
    if (group.empty()) return;
    const target = group.contains(requestedTarget) ? requestedTarget : group.first();
    const entities = group.map((n) => ({ id: n.id(), scale: n.data("scale") as number }));
    const newScales = groupScale(entities, target.id(), requestedScale, { min: SCALE_MIN, max: SCALE_MAX });

    group.forEach((n) => {
      const scale = newScales.get(n.id())!;
      const size = BASE_SIZE * scale;
      n.data("scale", scale);
      n.data("size", size);
      n.style({ width: size, height: size });
    });

    runSeparation(cy, group);
    callbacks.onNodesChanged(snapshotNodes(cy));
  }

  /**
   * Область под точкой (координаты окна) — области не ловят события мыши, ищем сами по той
   * же форме, что рисует faction-blobs.ts.
   */
  function factionElementAt(client: Point): string | null {
    if (!cy) return null;
    const rect = container.getBoundingClientRect();
    const point = clientToModel(client.x, client.y, { left: rect.left, top: rect.top, pan: cy.pan(), zoom: cy.zoom() });
    return findBlobAt(factionBlobGroups(cy), point);
  }

  function selectFactionElement(elementId: string, additive: boolean): void {
    if (!cy) return;
    const members = cy.getElementById(elementId).children();
    if (!additive) cy.elements().not(members).unselect();
    members.select();
  }

  function clientPoint(evt: cytoscape.EventObject): Point {
    const e = evt.originalEvent as MouseEvent;
    return { x: e.clientX, y: e.clientY };
  }

  /** Цель события Cytoscape. */
  function resolveTarget(evt: cytoscape.EventObject): GraphTarget {
    const target = evt.target as cytoscape.Singular | cytoscape.Core;
    if (target !== cy) {
      const element = target as cytoscape.Singular;
      return { kind: element.isNode() ? "node" : "edge", id: element.id() };
    }
    const factionElement = factionElementAt(clientPoint(evt));
    return factionElement ? { kind: "faction", id: factionIdFromElement(factionElement) } : { kind: "background" };
  }

  // Alt+wheel = resize, а не зум. Вид не должен зумиться, даже если ресайзить нечего.
  const onWheel = (e: WheelEvent) => {
    if (!e.altKey || !editable) return; // в просмотре Alt+колесо — обычный зум
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!cy) return;

    // pinned-узлы (у игрока — gmOnly) не ресайзятся: их нет ни в группе, ни «под курсором».
    const selected = movable(cy.$("node[!isFaction]:selected") as cytoscape.NodeCollection);
    const hoveredAny = regularNode(hoveredNodeId);
    const hovered = hoveredAny && hoveredAny.data("pinned") !== true ? hoveredAny : null;
    let group: cytoscape.NodeCollection;
    let target: cytoscape.NodeSingular;
    if (selected.nonempty()) {
      group = selected;
      target = hovered && hovered.selected() ? hovered : selected.first();
    } else if (hovered) {
      group = target = hovered;
    } else {
      return;
    }

    const step = (e.deltaY || e.deltaX) < 0 ? SCALE_STEP : -SCALE_STEP;
    // округление — чтобы шаги по 0.1 не копили погрешность float (0.30000000000000004)
    const requested = Math.round(((target.data("scale") as number) + step) * 100) / 100;
    resizeGroup(group, target, requested);
  };
  container.addEventListener("wheel", onWheel, { capture: true, passive: false });

  // Панорамирование вручную: зажатое колесо или Ctrl+ЛКМ. Cytoscape этих жестов не знает
  // (Ctrl+drag у неё — рамка выделения, среднюю кнопку она игнорирует).
  let panLast: Point | null = null;
  const onPanMove = (e: MouseEvent) => {
    if (!cy || !panLast) return;
    cy.panBy({ x: e.clientX - panLast.x, y: e.clientY - panLast.y });
    panLast = { x: e.clientX, y: e.clientY };
  };
  const onPanEnd = () => {
    panLast = null;
    window.removeEventListener("mousemove", onPanMove);
    window.removeEventListener("mouseup", onPanEnd);
  };

  // Жесты, которые забираем у Cytoscape целиком (она не должна увидеть mousedown, иначе
  // начнёт свой drag/рамку/снятие выделения).
  const onMouseDown = (e: MouseEvent) => {
    // S+ЛКМ по узлу — быстрое создание связи. Забираем клик у Cytoscape, чтобы узел не
    // выделялся и не начинал перетаскиваться.
    if (editable && sKeyDown && e.button === LEFT_BUTTON && !e.ctrlKey && !e.altKey && hoveredNodeId !== null) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (linkSourceId !== null) {
        pickLinkTarget(hoveredNodeId);
        return;
      }
      // Выделен ровно один другой узел — связь сразу от него к нажатому, без второго клика.
      const selected = cy ? cy.$("node[!isFaction]:selected") : null;
      if (selected && selected.length === 1 && selected.first().id() !== hoveredNodeId) {
        callbacks.onLinkPicked(selected.first().id(), hoveredNodeId);
      } else {
        callbacks.onQuickLink(hoveredNodeId);
      }
      return;
    }

    const isPan = e.button === MIDDLE_BUTTON || (e.button === LEFT_BUTTON && e.ctrlKey);
    const isFactionSelect = e.button === LEFT_BUTTON && e.altKey && !e.ctrlKey;
    if (!isPan && !isFactionSelect) return;

    e.preventDefault(); // для средней кнопки — ещё и отключает автоскролл браузера
    e.stopImmediatePropagation();

    if (isPan) {
      panLast = { x: e.clientX, y: e.clientY };
      window.addEventListener("mousemove", onPanMove);
      window.addEventListener("mouseup", onPanEnd);
      return;
    }

    const factionElement = factionElementAt({ x: e.clientX, y: e.clientY });
    if (factionElement) selectFactionElement(factionElement, e.shiftKey);
  };
  container.addEventListener("mousedown", onMouseDown, { capture: true });

  // ПКМ открывает наше меню (cxttap ниже), браузерное не нужно.
  const onDomContextMenu = (e: MouseEvent) => e.preventDefault();
  container.addEventListener("contextmenu", onDomContextMenu);

  // Esc снимает выделение (§6). Слушаем document, а не container: Cytoscape на каждом mousedown
  // делает blur активного элемента, так что фокус на контейнере не удержать. Срабатывает только
  // пока курсор над графом и есть что снимать — иначе Esc остаётся Foundry (закрытие окна).
  const onMouseEnter = () => {
    pointerInside = true;
  };
  const onMouseLeave = () => {
    pointerInside = false;
  };
  container.addEventListener("mouseenter", onMouseEnter);
  container.addEventListener("mouseleave", onMouseLeave);
  // Клавиша S отслеживается по физической клавише (e.code) — работает в любой раскладке.
  // Пока фокус в поле ввода, S — обычная буква.
  let sKeyDown = false;
  const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  const onSKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyS" && !isTyping(e.target)) sKeyDown = true;
  };
  const onSKeyUp = (e: KeyboardEvent) => {
    if (e.code === "KeyS") sKeyDown = false;
  };
  const onWindowBlur = () => {
    sKeyDown = false; // keyup в другом окне мы не увидим
  };
  document.addEventListener("keydown", onSKeyDown);
  document.addEventListener("keyup", onSKeyUp);
  window.addEventListener("blur", onWindowBlur);

  // Delete и Ctrl+Z/Ctrl+Y — только в режиме редактирования, пока курсор над графом и фокус не в
  // поле ввода (там это обычная правка текста). Ловим по e.code — в любой раскладке; событие
  // забираем, чтобы Foundry не выполнил свою отмену (например, перемещения токенов на сцене).
  const onEditKeyDown = (e: KeyboardEvent) => {
    if (!editable || !cy || !pointerInside || isTyping(e.target)) return;
    const ctrl = e.ctrlKey || e.metaKey;
    let handled = true;
    if (e.code === "Delete" && !ctrl && !e.altKey) {
      const selected = cy.$(":selected");
      callbacks.onDeleteSelected(
        selected.nodes("[!isFaction]").map((n) => n.id()),
        selected.edges().map((edge) => edge.id()),
      );
    } else if (ctrl && !e.altKey && e.code === "KeyZ") {
      if (e.shiftKey) callbacks.onRedo();
      else callbacks.onUndo();
    } else if (ctrl && !e.altKey && !e.shiftKey && e.code === "KeyY") {
      callbacks.onRedo();
    } else {
      handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  document.addEventListener("keydown", onEditKeyDown, { capture: true });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !cy) return;
    if (linkSourceId !== null) {
      // отмена создания связи — где бы ни был курсор
      endLinking();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!pointerInside) return;
    const selected = cy.$(":selected");
    if (selected.empty()) return;
    selected.unselect();
    e.preventDefault();
    e.stopPropagation();
  };
  document.addEventListener("keydown", onKeyDown, { capture: true });

  const onMouseOver = (evt: cytoscape.EventObject) => {
    hoveredNodeId = (evt.target as cytoscape.NodeSingular).id();
  };
  const onMouseOut = () => {
    hoveredNodeId = null;
  };

  // Групповой drag делает сама Cytoscape: при захвате выделенного узла она двигает все
  // выделенные и шлёт grab/drag/dragfree КАЖДОМУ из них. Раньше мы на эти события ещё и сами
  // переставляли группу — обработчик срабатывал по разу на каждый узел с дельтами, посчитанными
  // относительно другого узла, и группа уезжала. Теперь только фиксируем результат, один раз
  // за жест: dragfreeon приходит лишь узлу, за который тянули.
  const onDragFreeOn = (evt: cytoscape.EventObject) => {
    if (!cy) return;
    runSeparation(cy, resolveGroup(cy, evt.target as cytoscape.NodeSingular));
    callbacks.onNodesChanged(snapshotNodes(cy));
  };

  // Область подсвечивается, когда выделены все её узлы — каким бы способом их ни выделили.
  const onSelectionChanged = (evt: cytoscape.EventObject) => {
    const parent = (evt.target as cytoscape.NodeSingular).parent();
    if (parent.empty()) return;
    const children = parent.children();
    parent.toggleClass(FACTION_SELECTED_CLASS, children.filter(":selected").length === children.length);
  };

  const onNodeTap = (evt: cytoscape.EventObject) => {
    pickLinkTarget((evt.target as cytoscape.NodeSingular).id());
  };

  const onCxtTap = (evt: cytoscape.EventObject) => {
    if (linkSourceId !== null) {
      endLinking(); // ПКМ во время выбора второго узла — отмена, меню не открываем
      return;
    }
    callbacks.onContextMenu(resolveTarget(evt), clientPoint(evt));
  };

  const onDblTap = (evt: cytoscape.EventObject) => {
    const target = resolveTarget(evt);
    if (target.kind !== "background") callbacks.onInfo(target, clientPoint(evt));
  };

  return {
    bind(newCy: cytoscape.Core): void {
      cy = newCy;
      cy.on("mouseover", "node[!isFaction]", onMouseOver);
      cy.on("mouseout", "node[!isFaction]", onMouseOut);
      cy.on("dragfreeon", "node[!isFaction]", onDragFreeOn);
      cy.on("select unselect", "node[!isFaction]", onSelectionChanged);
      cy.on("tap", "node[!isFaction]", onNodeTap);
      cy.on("cxttap", onCxtTap);
      cy.on("dbltap", onDblTap);
    },
    resetScale(nodeId: string): void {
      const node = regularNode(nodeId);
      if (cy && node && editable) resizeGroup(resolveGroup(cy, node), node, 1.0);
    },
    selectFaction(factionId: string): void {
      selectFactionElement(factionElementId(factionId), false);
    },
    settle(nodeId: string): void {
      const node = regularNode(nodeId);
      if (!cy || !node) return;
      runSeparation(cy, node);
      callbacks.onNodesChanged(snapshotNodes(cy));
    },
    startLinking(sourceId: string): void {
      const source = regularNode(sourceId);
      if (!source || !editable) return;
      endLinking();
      linkSourceId = sourceId;
      source.addClass(LINK_SOURCE_CLASS);
      container.style.cursor = "crosshair";
      linkHint = document.createElement("div");
      linkHint.className = "frg-link-hint";
      linkHint.textContent = t("RELGRAPH.Edge.Linking");
      container.append(linkHint);
    },
    teardown(): void {
      endLinking();
      onPanEnd();
      container.removeEventListener("wheel", onWheel, { capture: true });
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
      container.removeEventListener("contextmenu", onDomContextMenu);
      container.removeEventListener("mouseenter", onMouseEnter);
      container.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      document.removeEventListener("keydown", onEditKeyDown, { capture: true });
      document.removeEventListener("keydown", onSKeyDown);
      document.removeEventListener("keyup", onSKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      cy?.off("mouseover", "node[!isFaction]", onMouseOver);
      cy?.off("mouseout", "node[!isFaction]", onMouseOut);
      cy?.off("dragfreeon", "node[!isFaction]", onDragFreeOn);
      cy?.off("select unselect", "node[!isFaction]", onSelectionChanged);
      cy?.off("tap", "node[!isFaction]", onNodeTap);
      cy?.off("cxttap", onCxtTap);
      cy?.off("dbltap", onDblTap);
      cy = null;
    },
  };
}
