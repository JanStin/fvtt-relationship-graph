/**
 * Точка входа модуля: регистрация в Foundry, кнопка в низу вкладки Actors.
 * Foundry вызывает init при загрузке мира, ready — когда всё готово,
 * renderActorDirectory — при каждом (пере)рендере сайдбар-вкладки Actors.
 *
 * Раньше кнопка была в Scene Controls (getSceneControlButtons) — там она не открывала
 * окно без видимых ошибок в консоли (вероятно, controls.tokens.tools не тот путь
 * в реальном рантайме v13, либо hook не долетал до нужной группы). Перенесено в
 * ActorDirectory по прямому запросу — плюс это надёжнее: у directory-приложений
 * стабильный renderActorDirectory hook с HTMLElement, а не вложенная структура
 * контролов, которую сложно проверить не отходя от живого Foundry.
 */

import { setTranslator, t } from "../core/i18n";
import { pickCleaner, releaseEditLock } from "./edit-lock";
import { MODULE_ID, registerSettings } from "./settings";
import { hideStorageEntry } from "./storage";

declare const Hooks: any;
declare const game: any;
declare const ui: any;
declare const foundry: any;

Hooks.once("init", () => {
  registerSettings();
});

// Переводы загружены — с этого момента t() отдаёт строки на языке из настроек Foundry.
Hooks.once("i18nInit", () => {
  setTranslator(
    (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key)),
    game.i18n.lang,
  );
});

Hooks.once("ready", () => {
  // Блокировка редактирования на нас осталась от прошлого сеанса (перезагрузка страницы
  // посреди редактирования) — окна графа сейчас точно нет, снимаем.
  if (game.user) void releaseEditLock(game.user.id).catch(logLockError);
});

// Редактор вышел из мира, не отжав «Редактировать» (закрыл вкладку, обрыв связи): флаг
// блокировки снимает один из оставшихся в сети (edit-lock.ts, pickCleaner).
Hooks.on("userConnected", (user: { id: string }, connected: boolean) => {
  if (connected || !game.user) return;
  const active = (game.users?.contents ?? []).filter((u: { active: boolean }) => u.active);
  if (pickCleaner(active) !== game.user.id) return;
  void releaseEditLock(user.id).catch(logLockError);
});

function logLockError(err: unknown): void {
  console.warn(`${MODULE_ID} | edit lock cleanup failed`, err);
}

// GraphApp.ts тянет за собой cytoscape+fcose (~860 KB) — ленивый импорт, чтобы это
// не грузилось для каждого пользователя при старте мира, только по клику на кнопку.
function openGraphApp(): void {
  import("../ui/GraphApp")
    .then(({ GraphApp }) => {
      const existing = foundry.applications.instances.get(GraphApp.DEFAULT_OPTIONS.id);
      if (existing) {
        existing.close();
      } else {
        new GraphApp().render(true);
      }
    })
    .catch((err: unknown) => {
      console.error(`${MODULE_ID} | failed to load GraphApp`, err);
      ui.notifications?.error(t("RELGRAPH.LoadFailed"));
    });
}

const BUTTON_MARKER = `data-${MODULE_ID}-button`;

// Видна и GM, и игрокам — граф общий для всех (см. docs/architecture.md §13, "Player view").
Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement) => {
  if (html.querySelector(`[${BUTTON_MARKER}]`)) return; // renderActorDirectory дёргается на каждый ре-рендер списка

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_MARKER, "");
  button.innerHTML = `<i class="fa-solid fa-diagram-project"></i> ${t("RELGRAPH.Title")}`;
  button.addEventListener("click", openGraphApp);

  const footer = html.querySelector(".directory-footer") ?? html.querySelector("footer");
  if (footer) {
    footer.appendChild(button);
  } else {
    console.warn(`${MODULE_ID} | не нашли .directory-footer в ActorDirectory, кнопка добавлена в корень`);
    html.appendChild(button);
  }
});

// Журнал-хранилище графа в списке журналов не показываем никому (storage.ts).
Hooks.on("renderJournalDirectory", (_app: unknown, html: HTMLElement) => {
  hideStorageEntry(html);
});

export {};
