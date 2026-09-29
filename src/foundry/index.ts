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

import { MODULE_ID, registerSettings } from "./settings";

declare const Hooks: any;
declare const ui: any;
declare const foundry: any;

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
  registerSettings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  ui.notifications?.info("Relationship Graph loaded");
});

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
      ui.notifications?.error("Relationship Graph: не удалось загрузить, см. консоль");
    });
}

const BUTTON_MARKER = `data-${MODULE_ID}-button`;

// Видна и GM, и игрокам — граф общий для всех (см. docs/architecture.md §13, "Player view").
Hooks.on("renderActorDirectory", (_app: unknown, html: HTMLElement) => {
  if (html.querySelector(`[${BUTTON_MARKER}]`)) return; // renderActorDirectory дёргается на каждый ре-рендер списка

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_MARKER, "");
  button.innerHTML = `<i class="fa-solid fa-diagram-project"></i> Relationship Graph`;
  button.addEventListener("click", openGraphApp);

  const footer = html.querySelector(".directory-footer") ?? html.querySelector("footer");
  if (footer) {
    footer.appendChild(button);
  } else {
    console.warn(`${MODULE_ID} | не нашли .directory-footer в ActorDirectory, кнопка добавлена в корень`);
    html.appendChild(button);
  }
});

export {};
