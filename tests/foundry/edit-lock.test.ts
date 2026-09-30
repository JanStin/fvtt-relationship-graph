import { afterEach, describe, expect, it } from "vitest";
import {
  acquireEditLock,
  currentEditor,
  pickCleaner,
  readEditLock,
  releaseEditLock,
  userName,
} from "../../src/foundry/edit-lock";
import { createMockJournalEntry, installMockFoundry, type MockUser } from "../mocks/foundry";

const GM: MockUser = { id: "gm", name: "Мастер", active: true, isGM: true };
const ALICE: MockUser = { id: "alice", name: "Алиса", active: true, isGM: false };
const BOB: MockUser = { id: "bob", name: "Боб", active: true, isGM: false };

let mock: ReturnType<typeof installMockFoundry> | undefined;

afterEach(() => {
  mock?.restore();
  mock = undefined;
});

/** Журнал-хранилище, в котором блокировку уже держит holderId. */
async function lockedBy(holderId: string) {
  const entry = createMockJournalEntry("Relationship Graph Data");
  await entry.setFlag("fvtt-relationship-graph", "editLock", { userId: holderId, since: 1 });
  return entry;
}

describe("acquireEditLock", () => {
  it("свободная блокировка захватывается; журнал создаётся, если его не было", async () => {
    mock = installMockFoundry({ users: [GM, ALICE] });

    expect(await acquireEditLock("alice")).toBe(true);
    expect(mock.journalEntries).toHaveLength(1);
    expect(readEditLock()?.userId).toBe("alice");
    expect(currentEditor()).toBe("alice");
  });

  it("занятая другим (в сети) — не захватывается и не перезаписывается", async () => {
    mock = installMockFoundry({ users: [GM, ALICE, BOB], journalEntries: [await lockedBy("bob")] });

    expect(await acquireEditLock("alice")).toBe(false);
    expect(readEditLock()?.userId).toBe("bob");
  });

  it("держатель не в сети — блокировка считается свободной", async () => {
    const offline = { ...BOB, active: false };
    mock = installMockFoundry({ users: [GM, ALICE, offline], journalEntries: [await lockedBy("bob")] });

    expect(currentEditor()).toBeNull();
    expect(await acquireEditLock("alice")).toBe(true);
    expect(currentEditor()).toBe("alice");
  });

  it("повторный захват своей блокировки проходит", async () => {
    mock = installMockFoundry({ users: [ALICE], journalEntries: [await lockedBy("alice")] });
    expect(await acquireEditLock("alice")).toBe(true);
  });
});

describe("releaseEditLock", () => {
  it("снимает только блокировку указанного пользователя", async () => {
    mock = installMockFoundry({ users: [ALICE, BOB], journalEntries: [await lockedBy("bob")] });

    await releaseEditLock("alice");
    expect(readEditLock()?.userId).toBe("bob");

    await releaseEditLock("bob");
    expect(readEditLock()).toBeNull();
    expect(currentEditor()).toBeNull();
  });

  it("без журнала ничего не делает", async () => {
    mock = installMockFoundry({ users: [ALICE] });
    await releaseEditLock("alice");
    expect(mock.journalEntries).toHaveLength(0);
  });
});

describe("pickCleaner", () => {
  it("предпочитает GM, из нескольких — с наименьшим id", () => {
    expect(pickCleaner([ALICE, { ...GM, id: "gm2" }, GM])).toBe("gm");
  });

  it("без GM — игрок с наименьшим id; никого — null", () => {
    expect(pickCleaner([BOB, ALICE])).toBe("alice");
    expect(pickCleaner([])).toBeNull();
  });
});

describe("userName", () => {
  it("имя пользователя или заглушка", () => {
    mock = installMockFoundry({ users: [ALICE] });
    expect(userName("alice")).toBe("Алиса");
    expect(userName("ghost")).toBe("другой пользователь");
  });
});
