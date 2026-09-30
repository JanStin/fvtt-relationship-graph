/**
 * Подключает уже проверенную (в spikes/spike-resize.html, S3) логику resize/drag/separation
 * к реальным событиям Cytoscape. core/layout.ts и core/selection.ts ничего не знают про
 * Cytoscape — вся стыковка с DOM/событиями здесь.
 *
 * Схема управления (см. docs/controls.md):
 *   колесо               — масштаб вида (нативно Cytoscape)
 *   зажатое колесо       — панорамирование вида (здесь)
 *   Alt+колесо           — resize выделенных узлов, а без выделения — узла под курсором (здесь)
 *   ЛКМ по узлу          — выделение и перетаскивание, выделенные двигаются группой (нативно)
 *   ЛКМ мимо узла        — панорамирование, в том числе по области фракции: области
 *                          "прозрачны" для мыши, см. graph-renderer.ts (нативно)
 *   Shift+ЛКМ            — добавить узел к выделению / рамка выделения (нативно)
 *   Ctrl+ЛКМ             — панорамирование независимо от того, что под курсором (здесь)
 *   Alt+ЛКМ              — выбор области: выделяются все узлы фракции (здесь)
 *   двойной клик ЛКМ     — информация об узле/области (callback onInfo)
 *   ПКМ                  — контекстное меню (callback onContextMenu)
 *   Esc                  — снять выделение
 *
 * Сами меню и карточка информации — в overlays.ts, наполняет их GraphApp: этот файл
 * ничего не знает про GraphData.
 */

import type cytoscape from "cytoscape";
import { clientToModel, findRegionAt, type Point, type Region } from "../core/hit-test";
import { separateOverlaps, type PositionedCircle } from "../core/layout";
import { groupScale, SCALE_MAX, SCALE_MIN } from "../core/selection";
import { BASE_SIZE, FACTION_SELECTED_CLASS, factionElementId, factionIdFromElement } from "./graph-renderer";

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
}

export interface InteractionHandle {
  /** Вызвать сразу после создания cytoscape(...) на том же container. */
  bind(cy: cytoscape.Core): void;
  /** Возвращает узлу scale = 1.0 (группе выделенных — пропорционально, как Alt+колесо). */
  resetScale(nodeId: string): void;
  /** Выделяет все узлы области (то же, что Alt+ЛКМ по ней). */
  selectFaction(factionId: string): void;
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

/** Раздвигает узлы после resize/drag: anchored — только что изменённая группа, остальные могут подвинуться. */
function runSeparation(cy: cytoscape.Core, anchored: cytoscape.NodeCollection): void {
  const regularNodes = cy.nodes("[!isFaction]");
  const circles: PositionedCircle[] = regularNodes.map((n) => ({
    id: n.id(),
    x: n.position().x,
    y: n.position().y,
    radius: (n.data("size") as number) / 2,
  }));

  const anchoredIds = new Set(anchored.map((n) => n.id()));
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
export function setupInteraction(container: HTMLElement, callbacks: InteractionCallbacks): InteractionHandle {
  let cy: cytoscape.Core | null = null;
  let hoveredNodeId: string | null = null;
  let pointerInside = false;

  function regularNode(id: string | null): cytoscape.NodeSingular | null {
    if (!cy || id === null) return null;
    const node = cy.getElementById(id) as cytoscape.NodeSingular;
    return node.empty() ? null : node;
  }

  /** Масштабирует группу пропорционально: target получает requestedScale, остальные — тот же коэффициент. */
  function resizeGroup(group: cytoscape.NodeCollection, target: cytoscape.NodeSingular, requestedScale: number): void {
    if (!cy) return;
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

  /** Область под точкой (координаты окна) — области не ловят события мыши, ищем по bounding box. */
  function factionElementAt(client: Point): string | null {
    if (!cy) return null;
    const rect = container.getBoundingClientRect();
    const point = clientToModel(client.x, client.y, { left: rect.left, top: rect.top, pan: cy.pan(), zoom: cy.zoom() });
    const regions: Region[] = cy.nodes("[?isFaction]").map((n) => {
      const bb = n.boundingBox({ includeLabels: false, includeOverlays: false });
      return { id: n.id(), x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 };
    });
    return findRegionAt(regions, point);
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
    if (!e.altKey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!cy) return;

    const selected = cy.$("node[!isFaction]:selected") as cytoscape.NodeCollection;
    const hovered = regularNode(hoveredNodeId);
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
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !pointerInside || !cy) return;
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

  const onCxtTap = (evt: cytoscape.EventObject) => {
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
      cy.on("cxttap", onCxtTap);
      cy.on("dbltap", onDblTap);
    },
    resetScale(nodeId: string): void {
      const node = regularNode(nodeId);
      if (cy && node) resizeGroup(resolveGroup(cy, node), node, 1.0);
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
    teardown(): void {
      onPanEnd();
      container.removeEventListener("wheel", onWheel, { capture: true });
      container.removeEventListener("mousedown", onMouseDown, { capture: true });
      container.removeEventListener("contextmenu", onDomContextMenu);
      container.removeEventListener("mouseenter", onMouseEnter);
      container.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("keydown", onKeyDown, { capture: true });
      cy?.off("mouseover", "node[!isFaction]", onMouseOver);
      cy?.off("mouseout", "node[!isFaction]", onMouseOut);
      cy?.off("dragfreeon", "node[!isFaction]", onDragFreeOn);
      cy?.off("select unselect", "node[!isFaction]", onSelectionChanged);
      cy?.off("cxttap", onCxtTap);
      cy?.off("dbltap", onDblTap);
      cy = null;
    },
  };
}
