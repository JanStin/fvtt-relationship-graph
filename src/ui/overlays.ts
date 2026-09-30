/**
 * Всплывающие элементы поверх графа: контекстное меню (ПКМ) и карточка информации
 * (двойной клик). Обычный DOM, без Cytoscape — что показывать, решает GraphApp.
 *
 * Одновременно открыт максимум один элемент. Закрывается по клику/прокрутке вне себя и по Esc.
 * host должен быть position:relative и НЕ быть контейнером Cytoscape (иначе клики по меню
 * доходили бы до графа).
 */

import type { Point } from "../core/hit-test";

export interface MenuItem {
  label: string;
  onSelect(): void;
}

export interface InfoRow {
  label: string;
  value: string;
}

export interface InfoCard {
  title: string;
  subtitle?: string;
  rows: InfoRow[];
}

export interface Overlays {
  /** client — clientX/clientY события мыши. Пустой список пунктов ничего не открывает. */
  showMenu(client: Point, items: MenuItem[]): void;
  showInfo(client: Point, card: InfoCard): void;
  close(): void;
  destroy(): void;
}

const EDGE_MARGIN = 4; // px, отступ от краёв host при прижатии

export function createOverlays(host: HTMLElement): Overlays {
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
  document.addEventListener("mousedown", onOutsidePointer, { capture: true });
  document.addEventListener("wheel", onOutsidePointer, { capture: true, passive: true });
  document.addEventListener("keydown", onKeyDown, { capture: true });

  return {
    showMenu(client, items) {
      if (items.length === 0) {
        close();
        return;
      }
      const menu = document.createElement("div");
      menu.className = "frg-overlay frg-menu";
      for (const item of items) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "frg-menu-item";
        button.textContent = item.label;
        button.addEventListener("click", () => {
          close();
          item.onSelect();
        });
        menu.append(button);
      }
      // ПКМ по самому меню не должен открывать браузерное.
      menu.addEventListener("contextmenu", (e) => e.preventDefault());
      open(menu, client);
    },

    showInfo(client, card) {
      const panel = document.createElement("div");
      panel.className = "frg-overlay frg-info";

      const title = document.createElement("div");
      title.className = "frg-info-title";
      title.textContent = card.title;
      panel.append(title);

      if (card.subtitle) {
        const subtitle = document.createElement("div");
        subtitle.className = "frg-info-subtitle";
        subtitle.textContent = card.subtitle;
        panel.append(subtitle);
      }

      for (const row of card.rows) {
        const label = document.createElement("div");
        label.className = "frg-info-label";
        label.textContent = row.label;
        const value = document.createElement("div");
        value.className = "frg-info-value";
        value.textContent = row.value;
        panel.append(label, value);
      }
      open(panel, client);
    },

    close,

    destroy() {
      close();
      document.removeEventListener("mousedown", onOutsidePointer, { capture: true });
      document.removeEventListener("wheel", onOutsidePointer, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    },
  };
}
