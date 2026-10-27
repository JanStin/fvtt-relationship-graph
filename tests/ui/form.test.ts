import { describe, expect, it } from "vitest";
import { addPanelTabs, appendColorSuggestions, colorField, createPanelShell, field, group, hint, contentLinksHint, linkTextArea, segmented, textInput } from "../../src/ui/panels/form";
import { createOverlays } from "../../src/ui/overlays";
import { createInfoPanel } from "../../src/ui/panels/InfoPanel";
import { DEFAULT_NODE_IMG } from "../../src/ui/graph-renderer";
import { createFactionPanel } from "../../src/ui/panels/FactionPanel";
import { createRelationshipTypePanel } from "../../src/ui/panels/RelationshipTypePanel";
import { createConditionPanel } from "../../src/ui/panels/ConditionPanel";
import { createIconPicker } from "../../src/ui/panels/icon-picker";
import { createEdgePanel } from "../../src/ui/panels/EdgePanel";
import { blankEdge, type EdgeEditValues } from "../../src/core/edit";

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
  const silent = { onClose() {}, onOpen() {}, onHover() {}, onExpand() {} };

  it("шапка, текстовый блок, значок видимости; крестик закрывает", () => {
    let closed = false;
    const panel = createInfoPanel(
      {
        title: "Анна",
        subtitle: "Актёр",
        header: { kind: "node", portrait: { img: "", fit: "contain", align: "top", border: "#ff0000" }, role: "Кузнец" },
        visibility: { icon: "fa-eye-slash", label: "Скрыт от игроков" },
        blocks: [{ kind: "text", id: "description", label: "Описание", text: "Высокая" }],
      },
      { ...silent, onClose: () => (closed = true) },
    );
    expect(panel.classList.contains("frg-panel")).toBe(true);
    expect(panel.querySelector(".frg-panel-title")!.textContent).toContain("Анна");
    expect(panel.querySelector(".frg-info-visibility")!.getAttribute("aria-label")).toBe("Скрыт от игроков");
    expect(panel.querySelector(".frg-info-subtitle")!.textContent).toBe("Актёр");
    expect(panel.querySelector(".frg-info-role")!.textContent).toBe("Кузнец");
    expect(panel.querySelector(".frg-field-label")!.textContent).toBe("Описание");
    expect(panel.querySelector(".frg-info-value")!.textContent).toBe("Высокая");
    // пустой путь — заглушка; вписывание и выравнивание — как на графе
    const portrait = panel.querySelector<HTMLImageElement>(".frg-info-portrait")!;
    expect(portrait.getAttribute("src")).toContain("placeholder-npc.png");
    expect(portrait.style.objectFit).toBe("contain");
    expect(portrait.style.objectPosition).toBe("50% 0%");
    panel.querySelector<HTMLButtonElement>(".frg-panel-close")!.click();
    expect(closed).toBe(true);
  });

  it("у связи — миниатюры двух концов и линия со стрелкой", () => {
    const end = { img: "a.png", fit: "cover", align: "center", border: null } as const;
    const panel = createInfoPanel(
      {
        title: "Связь",
        header: { kind: "edge", source: end, target: end, directional: true, bidirectional: false, color: "#00ff00", dash: [4, 4], gmOnly: false },
        blocks: [],
      },
      silent,
    );
    expect(panel.querySelectorAll(".frg-info-portrait")).toHaveLength(2);
    expect(panel.querySelector(".frg-info-edge-line line")!.getAttribute("stroke-dasharray")).toBe("4 4");
    expect(panel.querySelector(".frg-info-edge-line polygon")).not.toBeNull();
  });

  it("связь — кнопка: клик открывает узел, наведение подсвечивает узел и связь", () => {
    const opened: unknown[] = [];
    const hovered: unknown[] = [];
    const link = {
      label: "Боб",
      caption: "друг",
      nodeId: "b",
      edgeId: "e1",
      direction: "out",
      stroke: { color: "#00ff00", dash: null, gmOnly: true },
      portrait: null,
    } as const;
    const panel = createInfoPanel(
      {
        title: "Анна",
        header: { kind: "faction", color: "#000000" },
        blocks: [{ kind: "links", id: "connections", label: "Связи (1)", links: [link] }],
      },
      { onClose() {}, onOpen: (target) => opened.push(target), onHover: (value) => hovered.push(value), onExpand() {} },
    );
    const row = panel.querySelector<HTMLButtonElement>(".frg-info-link")!;
    expect(row.querySelector(".frg-info-link-direction")!.getAttribute("aria-label")).toBe("Исходящая");
    // сплошной тип у gmOnly-связи — пунктир, как на графе
    expect(row.querySelector("line")!.getAttribute("stroke-dasharray")).toBe("6 3");
    row.dispatchEvent(new MouseEvent("mouseenter"));
    row.dispatchEvent(new MouseEvent("mouseleave"));
    row.click();
    expect(hovered).toEqual([{ nodeId: "b", edgeId: "e1" }, null]);
    expect(opened).toEqual([{ kind: "node", id: "b" }]);
  });

  it("участник фракции — строкой как в поиске: миниатюра, имя, роль под ним", () => {
    const opened: unknown[] = [];
    const link = {
      label: "Неизвестный",
      caption: "Капитан",
      nodeId: "b",
      edgeId: null,
      direction: "none",
      stroke: null,
      portrait: { img: "", fit: "cover", align: "top", border: null },
    } as const;
    const panel = createInfoPanel(
      { title: "Стража", header: { kind: "faction", color: "#000000" }, blocks: [{ kind: "links", id: "members", label: "Участники (1)", links: [link] }] },
      { ...silent, onOpen: (target) => opened.push(target) },
    );
    const row = panel.querySelector<HTMLButtonElement>(".frg-info-link-member")!;
    const thumb = row.querySelector<HTMLImageElement>(".frg-search-thumb")!;
    // пустой путь (скрытый у игрока) — заглушка
    expect(thumb.getAttribute("src")).toBe(DEFAULT_NODE_IMG);
    expect(row.querySelector(".frg-search-name")!.textContent).toBe("Неизвестный");
    expect(row.querySelector(".frg-field-hint")!.textContent).toBe("Капитан");
    expect(row.querySelector(".frg-info-link-caption")).toBeNull();
    row.click();
    expect(opened).toEqual([{ kind: "node", id: "b" }]);
  });

  it("группы связей сворачиваются заголовком", () => {
    const link = { label: "Боб", caption: "", nodeId: "b", edgeId: "e1", direction: "none", stroke: null, portrait: null } as const;
    const panel = createInfoPanel(
      {
        title: "Анна",
        header: { kind: "faction", color: "#000000" },
        blocks: [{ kind: "links", id: "connections", label: "Связи (1)", links: [link], groups: [{ label: "друг", color: "#00ff00", links: [link] }] }],
      },
      silent,
    );
    const toggle = panel.querySelector<HTMLButtonElement>(".frg-info-group-toggle")!;
    expect(toggle.textContent).toBe("друг1");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel.querySelector<HTMLElement>(".frg-info-group .frg-info-links")!.hidden).toBe(true);
  });

  it("чип фракции — кнопка к её сведениям, основная выделена; состояние — чип с иконкой", () => {
    const opened: unknown[] = [];
    const panel = createInfoPanel(
      {
        title: "Анна",
        header: { kind: "faction", color: "#000000" },
        blocks: [
          {
            kind: "chips",
            id: "factions",
            label: "Фракции",
            chips: [{ label: "Стража", color: "#ff0000", primary: true, target: { kind: "faction", id: "f1" } }],
          },
          { kind: "chips", id: "conditions", label: "Состояния", chips: [{ label: "Мёртв", icon: "fa-solid fa-skull" }] },
        ],
      },
      { ...silent, onOpen: (target) => opened.push(target) },
    );
    const [faction, condition] = panel.querySelectorAll<HTMLElement>(".frg-info-chip");
    expect(faction.tagName).toBe("BUTTON");
    expect(faction.classList.contains("frg-info-chip-primary")).toBe(true);
    faction.click();
    expect(opened).toEqual([{ kind: "faction", id: "f1" }]);
    expect(condition.tagName).toBe("SPAN");
    expect(condition.querySelector(".fa-skull")).not.toBeNull();
  });

  it("пустое состояние с подсказкой", () => {
    const panel = createInfoPanel(
      { title: "Анна", header: { kind: "faction", color: "#000000" }, blocks: [], empty: { hint: "Заполните" } },
      silent,
    );
    expect(panel.querySelector(".frg-info-empty")!.textContent).toBe("Сведений нетЗаполните");
  });
});

describe("linkTextArea", () => {
  /** jsdom без DragEvent/DataTransfer: событие drop с подложенными данными. */
  function drop(target: HTMLElement, text: string): Event {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { types: ["text/plain"], getData: () => text } });
    target.dispatchEvent(event);
    return event;
  }

  it("перетащенный документ вставляется ссылкой в позицию курсора", () => {
    const area = linkTextArea("См. ");
    let inputs = 0;
    area.addEventListener("input", () => inputs++);
    area.setSelectionRange(4, 4);
    const event = drop(area, '{"type":"JournalEntry","uuid":"JournalEntry.AbC123"}');
    expect(event.defaultPrevented).toBe(true);
    expect(area.value).toBe("См. @UUID[JournalEntry.AbC123]");
    expect(inputs).toBe(1);
  });

  it("подсказка — с готовым примером ссылки", () => {
    expect(contentLinksHint().textContent).toContain("@UUID[JournalEntry.AbC123]{Дневник капитана}");
  });

  it("обычный текст — штатная вставка браузера", () => {
    const area = linkTextArea("");
    expect(drop(area, "просто текст").defaultPrevented).toBe(false);
    expect(area.value).toBe("");
  });
});

describe("colorField: цвет по умолчанию и сброс", () => {
  it("setFallback меняет показ пустого поля, clear сбрасывает свой цвет с событием input", () => {
    const color = colorField("#123456", "#0f172a");
    const [text, picker] = color.element.querySelectorAll("input");
    let inputs = 0;
    color.element.addEventListener("input", () => inputs++);
    color.setFallback("#efe4c8");
    expect(color.value()).toBe("#123456");
    color.clear();
    expect(color.value()).toBe("");
    expect((text as HTMLInputElement).value).toBe("");
    expect((picker as HTMLInputElement).value).toBe("#efe4c8");
    expect(inputs).toBe(1);
  });
});

describe("Другой цвет", () => {
  it("кнопка по кругу ставит следующий цвет с событием input", () => {
    const color = colorField("#111111");
    appendColorSuggestions(color, ["#111111", "#222222", "#333333"]);
    const button = color.element.querySelector<HTMLButtonElement>(".frg-color-another")!;
    expect(button.getAttribute("aria-label")).toBe("Другой цвет");
    let inputs = 0;
    color.element.addEventListener("input", () => inputs++);
    button.click();
    expect(color.value()).toBe("#222222");
    expect((color.element.querySelector('input[type="color"]') as HTMLInputElement).value).toBe("#222222");
    button.click();
    button.click();
    expect(color.value()).toBe("#111111");
    expect(inputs).toBe(3);
  });

  it("меньше двух цветов — кнопки нет", () => {
    const color = colorField("#111111");
    appendColorSuggestions(color, ["#111111"]);
    expect(color.element.querySelector(".frg-color-another")).toBeNull();
  });

  it("новая фракция — первый цвет и кнопка; правка и игрок — без кнопки", () => {
    const newColors = ["#aa0000", "#00aa00"];
    const created = createFactionPanel(null, noop, { isGM: true, newColors });
    expect(created.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe("#aa0000");
    expect(created.querySelector(".frg-color-another")).not.toBeNull();
    const faction = { id: "f", name: "Ф", color: "#123456", description: "" };
    expect(createFactionPanel(faction, noop, { isGM: true, newColors }).querySelector(".frg-color-another")).toBeNull();
  });

  it("новый тип связи — первый цвет и кнопка; правка — без кнопки", () => {
    const created = createRelationshipTypePanel(null, noop, ["#aa0000", "#00aa00"]);
    expect(created.querySelector<HTMLInputElement>('input[type="color"]')!.value).toBe("#aa0000");
    expect(created.querySelector(".frg-color-another")).not.toBeNull();
    const type = { id: "t", label: "Т", color: "#123456", dash: "" };
    expect(createRelationshipTypePanel(type, noop, ["#aa0000", "#00aa00"]).querySelector(".frg-color-another")).toBeNull();
  });
});

describe("выбор иконки состояния", () => {
  const choices = (element: HTMLElement) => [...element.querySelectorAll<HTMLButtonElement>(".frg-icon-choice")];
  const current = (element: HTMLElement) => choices(element).filter((b) => b.getAttribute("aria-pressed") === "true");

  it("сетка по группам, у кнопок — название; текущая отмечена галочкой и в Tab только она", () => {
    const picker = createIconPicker("fa-solid fa-crown");
    const groups = picker.element.querySelectorAll('[role="group"]');
    expect(groups.length).toBe(7);
    groups.forEach((group) => expect(group.getAttribute("aria-labelledby")).toBeTruthy());
    expect(choices(picker.element).length).toBe(68);
    const [crown] = current(picker.element);
    expect(crown.getAttribute("aria-label")).toBe("Корона");
    expect(crown.querySelector(".frg-icon-choice-check")).not.toBeNull();
    expect(choices(picker.element).filter((b) => b.tabIndex === 0)).toEqual([crown]);
    expect(picker.element.querySelector("details")!.open).toBe(false);
  });

  it("клик по иконке пишет её класс, отметка переезжает", () => {
    const picker = createIconPicker("");
    const ghost = choices(picker.element).find((b) => b.getAttribute("aria-label") === "Призрак")!;
    ghost.click();
    expect(picker.value()).toBe("fa-ghost");
    expect(current(picker.element)).toEqual([ghost]);
    expect(picker.element.querySelectorAll(".frg-icon-choice-check").length).toBe(1);
  });

  it("своя иконка не из набора — поле класса раскрыто, в сетке ничего не отмечено", () => {
    const picker = createIconPicker("fa-regular fa-star");
    expect(picker.element.querySelector("details")!.open).toBe(true);
    expect(current(picker.element)).toEqual([]);
    expect(choices(picker.element)[0].tabIndex).toBe(0);
    expect(picker.element.querySelector<HTMLAnchorElement>("details a")!.rel).toContain("noopener");
    const input = picker.element.querySelector<HTMLInputElement>("details input")!;
    input.value = "fa-skull";
    input.dispatchEvent(new Event("input"));
    expect(current(picker.element)[0].getAttribute("aria-label")).toBe("Череп");
  });

  it("стрелки и Home / End двигают фокус по сетке", () => {
    const picker = createIconPicker("fa-skull");
    document.body.append(picker.element);
    const buttons = choices(picker.element);
    buttons[0].focus();
    buttons[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
    buttons[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    buttons[buttons.length - 1].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
    picker.element.remove();
  });

  it("панель состояния сохраняет выбранную иконку", () => {
    let saved: { label: string; icon: string } | null = null;
    const panel = createConditionPanel(null, { onSave: (values) => (saved = values), onDelete() {}, onClose() {} });
    choices(panel).find((b) => b.getAttribute("aria-label") === "Дракон")!.click();
    panel.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(saved).toEqual({ label: "", icon: "fa-dragon" });
  });
});

describe("направление связи в панели", () => {
  const ends = { source: "Алиса", target: "Боб" };
  const open = (edge = blankEdge("e", "a", "b")) => {
    let saved: EdgeEditValues | null = null;
    const panel = createEdgePanel(edge, ends, [], { onSave: (v) => (saved = v), onDelete() {}, onClose() {} }, { isGM: true });
    const radios = [...panel.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    const save = () => {
      panel.dispatchEvent(new Event("submit", { cancelable: true }));
      return saved!;
    };
    return { panel, radios, save };
  };

  it("4 варианта с именами концов; у новой связи — без направления", () => {
    const { panel, radios, save } = open();
    expect(radios.map((r) => r.value)).toEqual(["none", "forward", "backward", "both"]);
    expect([...panel.querySelectorAll(".frg-segment span")].map((s) => s.textContent)).toEqual([
      "Без направления",
      "Алиса → Боб",
      "Боб → Алиса",
      "Алиса ↔ Боб",
    ]);
    expect(save().direction).toBe("none");
  });

  it("выбор варианта уходит в сохранение; двусторонняя связь открывается с «↔»", () => {
    const { radios, save } = open();
    radios[2].checked = true;
    expect(save().direction).toBe("backward");
    const both = open({ ...blankEdge("e", "a", "b"), directional: true, bidirectional: true });
    expect(both.radios.find((r) => r.checked)?.value).toBe("both");
  });
});
