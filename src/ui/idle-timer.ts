/**
 * Таймер бездействия редактора (tasks.md, B15): после ms без активности в target вызывает
 * onIdle один раз. Активность — движение мыши, нажатие кнопки, колесо, клавиша (в том числе
 * ввод в полях панелей: события всплывают до окна графа).
 */

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "wheel", "keydown"] as const;

export interface IdleTimer {
  stop(): void;
}

export function startIdleTimer(target: HTMLElement, ms: number, onIdle: () => void): IdleTimer {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const reset = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      stop();
      onIdle();
    }, ms);
  };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    ACTIVITY_EVENTS.forEach((type) => target.removeEventListener(type, reset, { capture: true }));
  };

  // capture — чтобы активность засчитывалась, даже если обработчик графа остановил событие
  ACTIVITY_EVENTS.forEach((type) => target.addEventListener(type, reset, { capture: true, passive: true }));
  reset();
  return { stop };
}
