import { afterEach, describe, expect, it, vi } from "vitest";
import { canViewUuid } from "../../src/foundry/enrich";

const docs: Record<string, unknown> = {
  "JournalEntry.open": { testUserPermission: () => true },
  "JournalEntry.closed": { testUserPermission: () => false },
  "Compendium.world.lore.JournalEntry.x": { pack: "world.lore" },
  "Compendium.world.gm.JournalEntry.y": { pack: "world.gm" },
};

function stub(isGM: boolean): void {
  vi.stubGlobal("fromUuidSync", (uuid: string) => docs[uuid] ?? null);
  vi.stubGlobal("game", {
    user: { isGM },
    packs: { get: (id: string) => ({ visible: id === "world.lore" }) },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("canViewUuid", () => {
  it("игрок: документ — по правам, компендиум — по видимости пакета, несуществующий — нет", () => {
    stub(false);
    expect(canViewUuid("JournalEntry.open")).toBe(true);
    expect(canViewUuid("JournalEntry.closed")).toBe(false);
    expect(canViewUuid("Compendium.world.lore.JournalEntry.x")).toBe(true);
    expect(canViewUuid("Compendium.world.gm.JournalEntry.y")).toBe(false);
    expect(canViewUuid("Actor.missing")).toBe(false);
  });

  it("GM видит всё существующее", () => {
    stub(true);
    expect(canViewUuid("JournalEntry.closed")).toBe(true);
    expect(canViewUuid("Actor.missing")).toBe(false);
  });
});
