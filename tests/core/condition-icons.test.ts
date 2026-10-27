import { describe, expect, it } from "vitest";
import { CONDITION_ICON_GROUPS, conditionIconNameKey, isCatalogConditionIcon, sameConditionIcon } from "../../src/core/condition-icons";
import ru from "../../lang/ru.json";

describe("набор иконок состояний", () => {
  const icons = CONDITION_ICON_GROUPS.flatMap((group) => group.icons);

  it("60–80 иконок без повторов, все — fa-<имя>", () => {
    expect(icons.length).toBeGreaterThanOrEqual(60);
    expect(icons.length).toBeLessThanOrEqual(80);
    expect(new Set(icons).size).toBe(icons.length);
    icons.forEach((icon) => expect(icon).toMatch(/^fa-[a-z0-9-]+$/));
  });

  it("у каждой иконки и группы есть название в ru.json", () => {
    const condition = ru.RELGRAPH.Condition as unknown as { IconName: Record<string, string>; IconGroup: Record<string, string> };
    icons.forEach((icon) => expect(condition.IconName[icon.replace(/^fa-/, "")], icon).toBeTruthy());
    CONDITION_ICON_GROUPS.forEach((group) => expect(condition.IconGroup[group.id], group.id).toBeTruthy());
    expect(conditionIconNameKey("fa-skull-crossbones")).toBe("RELGRAPH.Condition.IconName.skull-crossbones");
  });

  it("fa-skull и fa-solid fa-skull — одна иконка; другой стиль — своя", () => {
    expect(sameConditionIcon("fa-skull", " fa-solid fa-skull ")).toBe(true);
    expect(isCatalogConditionIcon("fa-solid fa-crown")).toBe(true);
    expect(isCatalogConditionIcon("fa-regular fa-star")).toBe(false);
    expect(isCatalogConditionIcon("fa-dragon-head")).toBe(false);
  });
});
