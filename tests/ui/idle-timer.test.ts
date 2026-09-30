import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startIdleTimer } from "../../src/ui/idle-timer";

describe("startIdleTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("срабатывает один раз после ms без активности", () => {
    const target = document.createElement("div");
    const onIdle = vi.fn();
    startIdleTimer(target, 1000, onIdle);

    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("любая активность — мышь, колесо, клавиша, в том числе во вложенном элементе — сбрасывает отсчёт", () => {
    const target = document.createElement("div");
    const input = document.createElement("input");
    target.append(input);
    const onIdle = vi.fn();
    startIdleTimer(target, 1000, onIdle);

    for (const event of [
      new MouseEvent("mousemove", { bubbles: true }),
      new WheelEvent("wheel", { bubbles: true }),
      new KeyboardEvent("keydown", { bubbles: true }),
    ]) {
      vi.advanceTimersByTime(900);
      input.dispatchEvent(event);
    }
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("stop отменяет таймер и перестаёт слушать", () => {
    const target = document.createElement("div");
    const onIdle = vi.fn();
    const timer = startIdleTimer(target, 1000, onIdle);

    timer.stop();
    target.dispatchEvent(new MouseEvent("mousemove"));
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
