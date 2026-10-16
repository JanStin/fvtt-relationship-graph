import { describe, expect, it } from "vitest";
import { createFactionListPanel } from "../../src/ui/panels/FactionPanel";

const factions = [{ id: "f1", name: "Стража", color: "#ff0000", description: "" }];

function list(editable: boolean) {
  const calls: string[] = [];
  const panel = createFactionListPanel(
    factions,
    () => 2,
    {
      onEdit: (id) => calls.push(`edit:${id}`),
      onInfo: (id) => calls.push(`info:${id}`),
      onCreate: () => calls.push("create"),
      onClose() {},
    },
    { editable, canCreate: true },
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
});
