import { describe, expect, it } from "vitest";
import { contentLinkFromDrop, hasContentLinks, restrictContentLinks } from "../../src/core/content-links";

describe("ссылки Foundry в тексте", () => {
  const canSee = (uuid: string) => uuid === "JournalEntry.open";

  it("доступные остаются, недоступные — подписью или «скрыто»", () => {
    const text = "См. @UUID[JournalEntry.open]{дневник}, @UUID[Actor.secret]{враг} и @UUID[Actor.secret].";
    expect(restrictContentLinks(text, canSee, "[скрыто]")).toBe("См. @UUID[JournalEntry.open]{дневник}, враг и [скрыто].");
  });

  it("текст без ссылок не меняется", () => {
    expect(hasContentLinks("просто текст [1]")).toBe(false);
    expect(hasContentLinks("@UUID[Actor.x]")).toBe(true);
    expect(restrictContentLinks("просто {текст}", canSee, "?")).toBe("просто {текст}");
  });

  it("перетащенный документ — ссылкой; не документ — null", () => {
    expect(contentLinkFromDrop('{"type":"JournalEntry","uuid":"JournalEntry.AbC123"}')).toBe("@UUID[JournalEntry.AbC123]");
    expect(contentLinkFromDrop('{"type":"Tile"}')).toBeNull();
    expect(contentLinkFromDrop("просто текст")).toBeNull();
  });
});
