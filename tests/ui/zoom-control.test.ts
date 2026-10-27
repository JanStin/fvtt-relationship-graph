import { describe, expect, it } from "vitest";
import type cytoscape from "cytoscape";
import { createZoomControl } from "../../src/ui/zoom-control";

/** Минимальный cytoscape: масштаб и события zoom. */
function fakeCy(initial: number) {
  let level = initial;
  const handlers: Array<() => void> = [];
  const cy = {
    zoom: (options?: { level: number }) => {
      if (options === undefined) return level;
      level = options.level;
      handlers.forEach((h) => h());
      return cy;
    },
    width: () => 800,
    height: () => 600,
    on: (_event: string, handler: () => void) => handlers.push(handler),
    off: () => {},
  };
  return cy as unknown as cytoscape.Core;
}

function setup(zoom = 1) {
  const control = createZoomControl();
  document.body.append(control.element);
  const cy = fakeCy(zoom);
  control.attach(cy);
  const label = control.element.querySelector<HTMLButtonElement>(".frg-zoom-label")!;
  const input = () => control.element.querySelector<HTMLInputElement>(".frg-zoom-input");
  return { control, cy, label, input };
}

const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("ввод масштаба", () => {
  it("двойной клик — поле с текущими процентами, Enter применяет", () => {
    const { control, cy, label, input } = setup(1.25);
    expect(label.textContent).toBe("125 %");
    label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(label.hidden).toBe(true);
    expect(input()!.value).toBe("125");
    expect(document.activeElement).toBe(input());
    input()!.value = "300";
    key(input()!, "Enter");
    expect(cy.zoom()).toBe(3);
    expect(input()).toBeNull();
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe("300 %");
    control.destroy();
  });

  it("Enter на процентах открывает поле; Esc — без изменений", () => {
    const { control, cy, label, input } = setup(1);
    key(label, "Enter");
    input()!.value = "50";
    key(input()!, "Escape");
    expect(cy.zoom()).toBe(1);
    expect(input()).toBeNull();
    control.destroy();
  });

  it("вне пределов — к границе; не число — как было", () => {
    const { control, cy, label, input } = setup(1);
    label.dispatchEvent(new MouseEvent("dblclick"));
    input()!.value = "1";
    key(input()!, "Enter");
    expect(cy.zoom()).toBe(0.05);
    label.dispatchEvent(new MouseEvent("dblclick"));
    input()!.value = "много";
    input()!.blur();
    expect(cy.zoom()).toBe(0.05);
    expect(label.getAttribute("aria-label")).toContain("5");
    control.destroy();
  });
});
