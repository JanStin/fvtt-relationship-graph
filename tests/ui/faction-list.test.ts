import { describe, expect, it } from "vitest";
import { createFactionListPanel } from "../../src/ui/panels/FactionPanel";

const factions = [
  { id: "f1", name: "Стража", color: "#ff0000", description: "" },
  { id: "f2", name: "Гильдия", color: "#00ff00", description: "" },
  { id: "f3", name: "Орден", color: "#0000ff", description: "" },
];

function list(editable: boolean, reorderable = false) {
  const calls: string[] = [];
  const panel = createFactionListPanel(
    factions,
    () => 2,
    {
      onEdit: (id) => calls.push(`edit:${id}`),
      onInfo: (id) => calls.push(`info:${id}`),
      onCreate: () => calls.push("create"),
      onMove: (id, index) => calls.push(`move:${id}:${index}`),
      onClose() {},
    },
    { editable, canCreate: true, reorderable },
  );
  return { panel, calls };
}

describe("список фракций", () => {
  it("в режиме просмотра строка открывает сведения фракции, создать нельзя", () => {
    const { panel, calls } = list(false);
    panel.querySelector<HTMLButtonElement>(".frg-faction-row")!.click();
    expect(calls).toEqual(["info:f1"]);
    expect(panel.querySelector(".frg-panel-footer")).toBeNull();
  });

  it("в режиме редактирования — форма фракции", () => {
    const { panel, calls } = list(true);
    panel.querySelector<HTMLButtonElement>(".frg-faction-row")!.click();
    expect(calls).toEqual(["edit:f1"]);
  });

  it("стрелок нет, пока порядок менять нельзя", () => {
    expect(list(true).panel.querySelector(".frg-catalog-move")).toBeNull();
  });

  it("стрелки ↑/↓: у первой строки «выше» выключена, у последней — «ниже»", () => {
    const { panel, calls } = list(true, true);
    const arrows = [...panel.querySelectorAll<HTMLButtonElement>(".frg-catalog-move")];
    expect(arrows.map((a) => a.disabled)).toEqual([true, false, false, false, false, true]);
    arrows[1].click();
    arrows[2].click();
    expect(calls).toEqual(["move:f1:1", "move:f2:0"]);
  });

  /** clientY 1 — нижняя половина строки (у jsdom размеры строк нулевые), 0 — верхняя. */
  function drag(panel: HTMLElement, from: number, to: number, clientY: number): void {
    const items = [...panel.querySelectorAll<HTMLElement>(".frg-catalog-item")];
    const event = (type: string) => Object.assign(new Event(type, { bubbles: true, cancelable: true }), { clientY });
    items[from].dispatchEvent(event("dragstart"));
    items[to].dispatchEvent(event("dragover"));
    items[to].dispatchEvent(event("drop"));
    items[from].dispatchEvent(event("dragend"));
  }

  it("перетаскивание: место — по половине строки, куда бросили", () => {
    const { panel, calls } = list(true, true);
    drag(panel, 0, 2, 1); // после последней
    drag(panel, 2, 0, 0); // перед первой
    drag(panel, 0, 1, 0); // перед соседней снизу — то же место
    expect(calls).toEqual(["move:f1:2", "move:f3:0"]);
    expect(panel.querySelector(".frg-drop-before, .frg-drop-after, .frg-dragging")).toBeNull();
  });

  it("чужое перетаскивание (не строка списка) не принимается", () => {
    const { panel, calls } = list(true, true);
    const item = panel.querySelector<HTMLElement>(".frg-catalog-item")!;
    const over = new Event("dragover", { bubbles: true, cancelable: true });
    item.dispatchEvent(over);
    item.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(over.defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });
});
