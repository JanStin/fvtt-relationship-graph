/**
 * Минимальные моки Foundry API для юнит-тестов src/foundry/*.
 * Не претендуют на полноту — расширяются по мере необходимости (см. docs/tasks.md).
 */

export interface MockActor {
  id: string;
  name: string;
  img: string;
}

export interface MockJournalEntry {
  id: string;
  name: string;
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<void>;
  ownership: { default: number };
  update(data: { ownership: { default: number } }): Promise<void>;
}

export function createMockJournalEntry(name: string, id = name, ownershipDefault = 0): MockJournalEntry {
  const flags: Record<string, Record<string, unknown>> = {};
  return {
    id,
    name,
    ownership: { default: ownershipDefault },
    async update(data) {
      this.ownership = { ...this.ownership, ...data.ownership };
    },
    getFlag(scope, key) {
      return flags[scope]?.[key];
    },
    async setFlag(scope, key, value) {
      flags[scope] = flags[scope] ?? {};
      flags[scope][key] = value;
    },
  };
}

export interface MockFoundryOptions {
  actors?: MockActor[];
  journalEntries?: MockJournalEntry[];
}

export interface MockFoundryHandles {
  game: {
    actors: { get: (id: string) => MockActor | null };
    journal: {
      getName: (name: string) => MockJournalEntry | null;
      get: (id: string) => MockJournalEntry | null;
    };
    modules: { get: (id: string) => { api: Record<string, unknown> } };
  };
  Hooks: {
    on: (event: string, fn: (...args: unknown[]) => void) => void;
    once: (event: string, fn: (...args: unknown[]) => void) => void;
    call: (event: string, ...args: unknown[]) => boolean;
    callAll: (event: string, ...args: unknown[]) => void;
  };
  ui: {
    notifications: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  };
  JournalEntry: { create: (data: { name: string; ownership?: { default: number } }) => Promise<MockJournalEntry> };
  journalEntries: MockJournalEntry[];
  notifications: Array<{ level: "info" | "warn" | "error"; message: string }>;
}

/**
 * Подменяет globalThis.game/Hooks/ui/JournalEntry моками на время теста.
 * Возвращает функцию restore() — вызвать в afterEach, чтобы не утечь между тестами.
 */
export function installMockFoundry(options: MockFoundryOptions = {}): MockFoundryHandles & { restore: () => void } {
  const journalEntries = [...(options.journalEntries ?? [])];
  const actorsMap = new Map((options.actors ?? []).map((a) => [a.id, a]));
  const notifications: MockFoundryHandles["notifications"] = [];
  const hookHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

  const game: MockFoundryHandles["game"] = {
    actors: { get: (id) => actorsMap.get(id) ?? null },
    journal: {
      getName: (name) => journalEntries.find((j) => j.name === name) ?? null,
      get: (id) => journalEntries.find((j) => j.id === id) ?? null,
    },
    modules: { get: () => ({ api: {} }) },
  };

  const Hooks: MockFoundryHandles["Hooks"] = {
    on: (event, fn) => {
      const list = hookHandlers.get(event) ?? [];
      list.push(fn);
      hookHandlers.set(event, list);
    },
    once: (event, fn) => Hooks.on(event, fn),
    call: (event, ...args) => {
      (hookHandlers.get(event) ?? []).forEach((fn) => fn(...args));
      return true;
    },
    callAll: (event, ...args) => {
      (hookHandlers.get(event) ?? []).forEach((fn) => fn(...args));
    },
  };

  const ui: MockFoundryHandles["ui"] = {
    notifications: {
      info: (message) => notifications.push({ level: "info", message }),
      warn: (message) => notifications.push({ level: "warn", message }),
      error: (message) => notifications.push({ level: "error", message }),
    },
  };

  const JournalEntry: MockFoundryHandles["JournalEntry"] = {
    create: async (data) => {
      const entry = createMockJournalEntry(data.name, data.name, data.ownership?.default ?? 0);
      journalEntries.push(entry);
      return entry;
    },
  };

  const g = globalThis as Record<string, unknown>;
  const previous = { game: g.game, Hooks: g.Hooks, ui: g.ui, JournalEntry: g.JournalEntry };
  g.game = game;
  g.Hooks = Hooks;
  g.ui = ui;
  g.JournalEntry = JournalEntry;

  return {
    game,
    Hooks,
    ui,
    JournalEntry,
    journalEntries,
    notifications,
    restore: () => {
      g.game = previous.game;
      g.Hooks = previous.Hooks;
      g.ui = previous.ui;
      g.JournalEntry = previous.JournalEntry;
    },
  };
}
