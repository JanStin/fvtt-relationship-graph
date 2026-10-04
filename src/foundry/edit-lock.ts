/**
 * Блокировка редактирования графа: в каждый момент редактор один.
 *
 * Кто редактирует — флаг editLock на том же журнале-хранилище (storage.ts): писать в него
 * игроки уже могут, а изменение приходит всем клиентам хуком updateJournalEntry.
 *
 * Блокировка «зависшего» редактора: если держатель не в сети (game.users → active: false),
 * блокировка считается свободной — её может взять любой. Чистит такой флаг один клиент по
 * хуку userConnected (см. foundry/index.ts), а свой старый флаг — сам пользователь при входе.
 *
 * Гонка: два клиента нажали «Редактировать» одновременно — сервер применит записи по очереди,
 * победит последняя. Проигравший узнаёт об этом из updateJournalEntry (держатель не он) и
 * выходит в просмотр (GraphApp).
 */

import { t } from "../core/i18n";
import { FLAG_SCOPE, getOrCreateStorageEntry, getStorageEntry } from "./storage";

declare const game: {
  user?: { id: string } | null;
  users?: { get(id: string): { id: string; name: string; active: boolean } | undefined | null };
};

export const LOCK_FLAG_KEY = "editLock";

export interface EditLock {
  userId: string;
  /** Date.now() момента захвата — для отладки. */
  since: number;
}

function isEditLock(value: unknown): value is EditLock {
  return typeof value === "object" && value !== null && typeof (value as EditLock).userId === "string";
}

/** Флаг как есть (в том числе держатель не в сети); null — никто не записан. */
export function readEditLock(): EditLock | null {
  const value = getStorageEntry()?.getFlag(FLAG_SCOPE, LOCK_FLAG_KEY);
  return isEditLock(value) ? value : null;
}

/** id того, кто сейчас реально редактирует: записан в блокировке и в сети. null — свободно. */
export function currentEditor(): string | null {
  const lock = readEditLock();
  if (!lock) return null;
  return game.users?.get(lock.userId)?.active === true ? lock.userId : null;
}

/** Имя пользователя для подсказок. */
export function userName(userId: string): string {
  return game.users?.get(userId)?.name ?? t("RELGRAPH.Common.OtherUser");
}

/**
 * Пытается стать редактором. false — редактирует другой (в сети) пользователь.
 * Создаёт журнал-хранилище, если его ещё нет.
 */
export async function acquireEditLock(userId: string): Promise<boolean> {
  const editor = currentEditor();
  if (editor !== null && editor !== userId) return false;
  const entry = await getOrCreateStorageEntry();
  await entry.setFlag(FLAG_SCOPE, LOCK_FLAG_KEY, { userId, since: Date.now() } satisfies EditLock);
  // Пока шла запись, мог успеть записаться другой — побеждает последняя запись.
  return readEditLock()?.userId === userId;
}

/**
 * Снимает блокировку, только если она принадлежит userId: свою — при выходе из режима, чужую —
 * когда держатель вышел из мира (вызывает один клиент, см. pickCleaner).
 */
export async function releaseEditLock(userId: string): Promise<void> {
  const entry = getStorageEntry();
  if (!entry || readEditLock()?.userId !== userId) return;
  await entry.setFlag(FLAG_SCOPE, LOCK_FLAG_KEY, null);
}

/**
 * Кто из оставшихся в сети чистит флаг ушедшего: активный GM, а без GM — любой игрок; из
 * нескольких кандидатов — с наименьшим id (все клиенты придут к одному и тому же ответу).
 */
export function pickCleaner(active: ReadonlyArray<{ id: string; isGM: boolean }>): string | null {
  const gms = active.filter((u) => u.isGM);
  const pool = gms.length > 0 ? gms : active;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => a.id.localeCompare(b.id))[0].id;
}
