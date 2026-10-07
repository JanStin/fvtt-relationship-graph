/**
 * Отдельное окно браузера для графа (pop-out). Элемент окна приложения переносится в новое
 * окно того же источника: JS, данные, хуки и сокет Foundry остаются общими с главным окном,
 * а новое окно можно вынести на другой монитор. Стили, тема и шрифты копируются из главного
 * документа.
 *
 * Что должен учитывать код графа: всё, что привязано к окну (слушатели клавиш и мыши на
 * document/window, requestAnimationFrame, devicePixelRatio, ResizeObserver), берётся у окна
 * своего элемента — windowOf(). Cytoscape после переноса строится заново: его окно —
 * ownerDocument контейнера, а кадры анимации переключаются на новое окно
 * (cytoscape.setAnimationWindow, патч patches/cytoscape+*.patch).
 *
 * Окна Foundry, которые граф открывает сам (подтверждение удаления, выбор файла), переносятся
 * в отдельное окно через adoptIntoPopout — иначе они появились бы на другом мониторе. При
 * закрытии отдельного окна они возвращаются в главное.
 *
 * В приложении Foundry (Electron) window.open всегда запрещён — там отдельных окон нет (canPopout).
 */

/** Окно, в документе которого лежит node; без документа — главное окно. */
export function windowOf(node: Node | null | undefined): Window & typeof globalThis {
  return (node?.ownerDocument?.defaultView ?? window) as Window & typeof globalThis;
}

/** Можно ли открыть отдельное окно: в приложении Foundry (Electron) — нельзя. */
export function canPopout(): boolean {
  return !/Electron/i.test(navigator.userAgent);
}

export interface Popout {
  readonly window: Window;
  /** Закрыть окно из кода; onClosed при этом не вызывается. */
  close(): void;
}

export interface PopoutOptions {
  title: string;
  width: number;
  height: number;
  /** Пользователь закрыл окно (или перезагрузил его) — элемент надо вернуть в главное окно. */
  onClosed(): void;
}

/** Имя окна: повторное открытие попадает в то же окно, а не плодит новые. */
const WINDOW_NAME = "fvtt-relationship-graph";

/** Открытое отдельное окно — одно на клиент (окно графа тоже одно). */
let active: { popout: Popout; adopted: Set<HTMLElement> } | null = null;

/** Копирует атрибуты class, style и lang: тема и CSS-переменные Foundry висят на html и body. */
function copyAttributes(from: HTMLElement, to: HTMLElement): void {
  for (const name of ["class", "style", "lang"]) {
    const value = from.getAttribute(name);
    if (value !== null) to.setAttribute(name, value);
  }
}

function prepareDocument(doc: Document, title: string): void {
  // чистый документ в стандартном режиме (начальный about:blank может быть в режиме совместимости)
  doc.open();
  doc.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body></body></html>");
  doc.close();
  doc.title = title;
  // относительные пути картинок и шрифтов — от адреса Foundry, а не от about:blank
  const base = doc.createElement("base");
  base.href = document.baseURI;
  doc.head.append(base);
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => doc.head.append(node.cloneNode(true)));
  copyAttributes(document.documentElement, doc.documentElement);
  copyAttributes(document.body, doc.body);
  doc.body.classList.add("frg-popout-body");
  // шрифты, загруженные через FontFace API (в том числе «Дополнительные шрифты» мира)
  document.fonts.forEach((face) => {
    try {
      doc.fonts.add(face);
    } catch {
      // шрифт другого окна не принят — останется шрифт по умолчанию
    }
  });
}

/** Возвращает перенесённые окна Foundry в главный документ. */
function returnAdopted(adopted: Set<HTMLElement>): void {
  adopted.forEach((element) => {
    if (element.isConnected) document.body.append(element);
  });
  adopted.clear();
}

/** Открывает отдельное окно; null — браузер не дал его открыть (блокировщик всплывающих окон). */
export function openPopout(options: PopoutOptions): Popout | null {
  const features = `popup,width=${Math.round(options.width)},height=${Math.round(options.height)}`;
  const win = window.open("", WINDOW_NAME, features);
  if (!win) return null;
  prepareDocument(win.document, options.title);

  const adopted = new Set<HTMLElement>();
  let closed = false;
  const detach = () => {
    closed = true;
    win.removeEventListener("pagehide", onPopoutHide);
    window.removeEventListener("pagehide", onOpenerHide);
    if (active?.popout === popout) active = null;
  };
  // пользователь закрыл или перезагрузил отдельное окно
  const onPopoutHide = () => {
    if (closed) return;
    detach();
    returnAdopted(adopted);
    options.onClosed();
    // после перезагрузки окно пустое — закрываем его
    setTimeout(() => win.close());
  };
  // главное окно закрывается или перезагружается — отдельное без него не работает
  const onOpenerHide = () => win.close();
  win.addEventListener("pagehide", onPopoutHide);
  window.addEventListener("pagehide", onOpenerHide);

  const popout: Popout = {
    window: win,
    close() {
      if (closed) return;
      detach();
      returnAdopted(adopted);
      win.close();
    },
  };
  active = { popout, adopted };
  return popout;
}

/**
 * Переносит окно Foundry, открытое графом (подтверждение, выбор файла), в отдельное окно, если
 * граф сейчас там. Позиция, посчитанная Foundry по главному окну, заменяется центром отдельного.
 */
export function adoptIntoPopout(app: { element?: HTMLElement | null }): void {
  const element = app.element;
  if (!active || !element || active.popout.window.closed) return;
  const doc = active.popout.window.document;
  doc.body.append(element);
  active.adopted.add(element);
  const { clientWidth, clientHeight } = doc.documentElement;
  element.style.left = `${Math.max(0, (clientWidth - element.offsetWidth) / 2)}px`;
  element.style.top = `${Math.max(0, (clientHeight - element.offsetHeight) / 2)}px`;
}
