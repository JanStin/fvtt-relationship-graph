/**
 * Всплывающее контекстное меню (ПКМ) поверх графа. Обычный DOM, без Cytoscape — что
 * показывать, решает GraphApp. Сведения об элементе — боковой панелью (panels/InfoPanel.ts).
 *
 * Одновременно открыто максимум одно меню. Закрывается по клику/прокрутке вне себя и по Esc.
 * host должен быть position:relative и НЕ быть контейнером Cytoscape (иначе клики по меню
 * доходили бы до графа).
 */

import type { Point } from "../core/hit-test";

export interface MenuItem {
  label: string;
  /** Клавиши того же действия — справа от пункта (например, `Delete`). */
  shortcut?: string;
  onSelect(): void;
}

export interface Overlays {
  /** client — clientX/clientY события мыши. Пустой список пунктов ничего не открывает. */
  showMenu(client: Point, items: MenuItem[]): void;
  /** Открыто ли сейчас меню. */
  isOpen(): boolean;
  close(): void;
  destroy(): void;
}

const EDGE_MARGIN = 4; // px, отступ от краёв host при прижатии

export function createOverlays(host: HTMLElement): Overlays {
  // документ окна графа — главного или отдельного (popout.ts)
  const doc = host.ownerDocument;
  let current: HTMLElement | null = null;

  function close(): void {
    current?.remove();
    current = null;
  }

  /** Ставит элемент у курсора, не давая вылезти за пределы host. */
  function open(element: HTMLElement, client: Point): void {
    close();
    host.append(element);
    current = element;

    const hostRect = host.getBoundingClientRect();
    const maxLeft = hostRect.width - element.offsetWidth - EDGE_MARGIN;
    const maxTop = hostRect.height - element.offsetHeight - EDGE_MARGIN;
    const left = Math.max(EDGE_MARGIN, Math.min(client.x - hostRect.left, maxLeft));
    const top = Math.max(EDGE_MARGIN, Math.min(client.y - hostRect.top, maxTop));
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  }

  const isOutside = (e: Event) => current !== null && !current.contains(e.target as Node);
  const onOutsidePointer = (e: Event) => {
    if (isOutside(e)) close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !current) return;
    close();
    e.preventDefault();
    e.stopPropagation(); // иначе Foundry тем же Esc закроет всё окно графа
  };
  doc.addEventListener("mousedown", onOutsidePointer, { capture: true });
  doc.addEventListener("wheel", onOutsidePointer, { capture: true, passive: true });
  doc.addEventListener("keydown", onKeyDown, { capture: true });

  return {
    showMenu(client, items) {
      if (items.length === 0) {
        close();
        return;
      }
      const menu = document.createElement("div");
      menu.className = "frg-overlay frg-menu";
      menu.setAttribute("role", "menu");
      const buttons = items.map((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "frg-menu-item";
        button.setAttribute("role", "menuitem");
        // фокус ходит стрелками, Tab из меню не уводит на каждый пункт
        button.tabIndex = -1;
        const label = document.createElement("span");
        label.textContent = item.label;
        button.append(label);
        if (item.shortcut) {
          const keys = document.createElement("kbd");
          keys.className = "frg-menu-shortcut";
          keys.textContent = item.shortcut;
          button.append(keys);
          button.setAttribute("aria-keyshortcuts", item.shortcut.replace(/ \+ /g, "+"));
        }
        button.addEventListener("click", () => {
          close();
          item.onSelect();
        });
        return button;
      });
      menu.append(...buttons);
      // Стрелки — по пунктам по кругу, Home/End — к первому/последнему; Enter и пробел нажимают
      // кнопку штатно, Esc закрывает меню (onKeyDown выше).
      menu.addEventListener("keydown", (e) => {
        const current = buttons.indexOf(doc.activeElement as HTMLButtonElement);
        const last = buttons.length - 1;
        let next: number;
        if (e.key === "ArrowDown") next = current < 0 || current === last ? 0 : current + 1;
        else if (e.key === "ArrowUp") next = current <= 0 ? last : current - 1;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = last;
        else return;
        e.preventDefault();
        e.stopPropagation();
        buttons[next].focus();
      });
      // ПКМ по самому меню не должен открывать браузерное.
      menu.addEventListener("contextmenu", (e) => e.preventDefault());
      open(menu, client);
      buttons[0].focus({ preventScroll: true });
    },

    isOpen() {
      return current !== null;
    },

    close,

    destroy() {
      close();
      doc.removeEventListener("mousedown", onOutsidePointer, { capture: true });
      doc.removeEventListener("wheel", onOutsidePointer, { capture: true });
      doc.removeEventListener("keydown", onKeyDown, { capture: true });
    },
  };
}
