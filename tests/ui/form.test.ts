import { describe, expect, it } from "vitest";
import { addPanelTabs, colorField, createPanelShell, field, group, hint, segmented, textInput } from "../../src/ui/panels/form";
import { createOverlays } from "../../src/ui/overlays";
import { createInfoPanel } from "../../src/ui/panels/InfoPanel";

const noop = { onSave() {}, onDelete() {}, onClose() {} };

describe("field / group", () => {
  it("второе поле строки названо подписью, подсказка описывает все поля", () => {
    const color = colorField("#112233");
    const element = field("Цвет", color.element, hint("Пусто — стандартный"));
    const [text, picker] = element.querySelectorAll("input");
    const caption = element.querySelector(".frg-field-label")!;
    const help = element.querySelector(".frg-field-hint")!;
    // первое поле названо обёрткой <label>
    expect(text.hasAttribute("aria-labelledby")).toBe(false);
    expect(picker.getAttribute("aria-labelledby")).toBe(caption.id);
    expect(text.getAttribute("aria-describedby")).toBe(help.id);
    expect(picker.getAttribute("aria-describedby")).toBe(help.id);
  });

  it("свой aria-label не перезаписывается", () => {
    const x = textInput("1");
    const y = textInput("2");
    x.setAttribute("aria-label", "X");
    y.setAttribute("aria-label", "Y");
    const row = document.createElement("div");
    row.append(x, y);
    group("Положение", row);
    expect(x.getAttribute("aria-label")).toBe("X");
    expect(y.hasAttribute("aria-labelledby")).toBe(false);
  });

  it("группа сегментов названа подписью группы; радиокнопки — нет", () => {
    const control = segmented([{ value: "a", label: "A" }, { value: "b", label: "B" }], "b");
    const element = group("Режим", control.element);
    const caption = element.querySelector(".frg-field-label")!;
    expect(control.element.getAttribute("aria-labelledby")).toBe(caption.id);
    expect(element.querySelector("input")!.hasAttribute("aria-labelledby")).toBe(false);
    expect(control.value()).toBe("b");
  });
});

describe("segmented", () => {
  it("иконка вместо текста: подпись — в title и aria-label", () => {
    const control = segmented([{ value: "a", label: "Подпись", icon: "fa-circle" }], "a");
    const item = control.element.querySelector(".frg-segment") as HTMLElement;
    expect(item.title).toBe("Подпись");
    expect(item.querySelector("input")!.getAttribute("aria-label")).toBe("Подпись");
    expect(item.querySelector("i.fa-circle")).not.toBeNull();
  });
});

describe("colorField", () => {
  it("пустое значение — «не задан»: палитра показывает цвет по умолчанию, а не чёрный", () => {
    const color = colorField("", "#16213e");
    const [text, picker] = color.element.querySelectorAll("input");
    expect(text.placeholder).not.toBe("");
    expect(picker.value).toBe("#16213e");
    expect(picker.classList.contains("frg-color-unset")).toBe(true);
    expect(color.value()).toBe("");

    picker.value = "#ff0000";
    picker.dispatchEvent(new Event("input"));
    expect(color.value()).toBe("#ff0000");
    expect(picker.classList.contains("frg-color-unset")).toBe(false);
  });

  it("нестандартный формат цвета не затирается", () => {
    const color = colorField("#000");
    expect(color.value()).toBe("#000");
    expect(color.element.querySelectorAll("input")[1].classList.contains("frg-color-unset")).toBe(false);
  });
});

describe("addPanelTabs", () => {
  it("роли вкладок, aria-selected и переключение стрелками", () => {
    const shell = createPanelShell("Панель", null, noop);
    addPanelTabs(shell, [
      { label: "Один", content: [document.createElement("div")] },
      { label: "Два", content: [document.createElement("div")] },
    ]);
    document.body.append(shell.element);
    const bar = shell.element.querySelector("[role='tablist']")!;
    const tabs = [...bar.querySelectorAll<HTMLButtonElement>("[role='tab']")];
    const panes = [...shell.element.querySelectorAll<HTMLElement>("[role='tabpanel']")];
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    expect(tabs[0].getAttribute("aria-controls")).toBe(panes[0].id);

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(panes[0].hidden).toBe(true);
    expect(document.activeElement).toBe(tabs[1]);
    shell.element.remove();
  });
});

describe("контекстное меню", () => {
  it("роли, фокус на первом пункте, стрелки по кругу, клавиши у пункта", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const overlays = createOverlays(host);
    let picked = "";
    overlays.showMenu({ x: 0, y: 0 }, [
      { label: "Первый", onSelect: () => (picked = "1") },
      { label: "Удалить", shortcut: "Delete", onSelect: () => (picked = "2") },
    ]);
    const menu = host.querySelector("[role='menu']")!;
    const items = [...menu.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
    expect(overlays.isOpen()).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    expect(items[1].querySelector("kbd")!.textContent).toBe("Delete");

    items[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    items[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(items[0]);

    items[0].click();
    expect(picked).toBe("1");
    expect(host.querySelector("[role='menu']")).toBeNull();
    expect(overlays.isOpen()).toBe(false);
    overlays.destroy();
    host.remove();
  });
});

describe("панель сведений", () => {
  it("заголовок, подзаголовок и поля; крестик закрывает", () => {
    let closed = false;
    const panel = createInfoPanel(
      { title: "Анна", subtitle: "Актёр", rows: [{ label: "Роль", value: "Кузнец" }] },
      () => (closed = true),
    );
    expect(panel.classList.contains("frg-panel")).toBe(true);
    expect(panel.querySelector(".frg-panel-title")!.textContent).toBe("Анна");
    expect(panel.querySelector(".frg-info-subtitle")!.textContent).toBe("Актёр");
    expect(panel.querySelector(".frg-field-label")!.textContent).toBe("Роль");
    expect(panel.querySelector(".frg-info-value")!.textContent).toBe("Кузнец");
    panel.querySelector<HTMLButtonElement>(".frg-panel-close")!.click();
    expect(closed).toBe(true);
  });
});
