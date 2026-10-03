import { afterEach, describe, expect, it } from "vitest";
import { syncNodeWithActor, syncNodesWithActors } from "../../src/foundry/actors";
import type { GraphNode } from "../../src/core/model";
import { installMockFoundry } from "../mocks/foundry";

function makeNode(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    type: "actor",
    actorId: null,
    name: "cached name",
    originalName: "cached name",
    img: "cached.webp",
    x: 0,
    y: 0,
    scale: 1.0,
    primaryFactionId: null,
    factionIds: [],
    role: "",
    lore: "",
    playerNotes: "",
    gmNotes: "",
    conditions: [],
    hidden: false,
    gmOnly: false,
    ...overrides,
  };
}

let mock: ReturnType<typeof installMockFoundry> | undefined;

afterEach(() => {
  mock?.restore();
  mock = undefined;
});

describe("syncNodeWithActor", () => {
  it("узел без actorId возвращается без изменений", () => {
    mock = installMockFoundry();
    const node = makeNode({ id: "n1", actorId: null });
    expect(syncNodeWithActor(node)).toBe(node); // тот же объект, не просто equal
  });

  it("подтягивает img/name из найденного актёра", () => {
    mock = installMockFoundry({ actors: [{ id: "a1", name: "Живое имя", img: "live.webp" }] });
    const node = makeNode({ id: "n1", actorId: "a1" });

    const result = syncNodeWithActor(node);
    expect(result).toMatchObject({ actorId: "a1", name: "Живое имя", img: "live.webp" });
  });

  it("у узла с источником «Токен» — картинка токена, шаблонный токен — портрет", () => {
    mock = installMockFoundry({
      actors: [
        { id: "a1", name: "А", img: "portrait.webp", prototypeToken: { texture: { src: "token.webp" } } },
        { id: "a2", name: "Б", img: "portrait.webp", prototypeToken: { texture: { src: "goblins/*.webp" } } },
      ],
    });
    expect(syncNodeWithActor(makeNode({ id: "n1", actorId: "a1", imageSource: "token" })).img).toBe("token.webp");
    expect(syncNodeWithActor(makeNode({ id: "n1", actorId: "a1" })).img).toBe("portrait.webp");
    expect(syncNodeWithActor(makeNode({ id: "n2", actorId: "a2", imageSource: "token" })).img).toBe("portrait.webp");
  });

  it("если актёр не найден — actorId обнуляется, остальные поля не трогаются", () => {
    mock = installMockFoundry({ actors: [] });
    const node = makeNode({ id: "n1", actorId: "missing-actor", name: "cached name", img: "cached.webp" });

    const result = syncNodeWithActor(node);
    expect(result).toMatchObject({ actorId: null, name: "cached name", img: "cached.webp" });
  });
});

describe("syncNodesWithActors", () => {
  it("применяет синхронизацию к каждому узлу списка", () => {
    mock = installMockFoundry({ actors: [{ id: "a1", name: "Актёр", img: "a.webp" }] });
    const nodes = [
      makeNode({ id: "n1", actorId: "a1" }),
      makeNode({ id: "n2", actorId: null }),
      makeNode({ id: "n3", actorId: "missing" }),
    ];

    const result = syncNodesWithActors(nodes);
    expect(result[0]).toMatchObject({ name: "Актёр", img: "a.webp" });
    expect(result[1].actorId).toBeNull();
    expect(result[2].actorId).toBeNull();
  });
});
