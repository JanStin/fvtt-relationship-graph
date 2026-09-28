declare const Hooks: any;
declare const ui: any;

/**
 * Точка входа модуля.
 * Foundry вызовет init при загрузке мира, ready — когда всё готово.
 */

const MODULE_ID = "fvtt-relationship-graph";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | init`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
  ui.notifications?.info("Relationship Graph loaded");
});

export {};
