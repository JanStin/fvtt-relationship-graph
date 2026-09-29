declare const Hooks: any;
declare const ui: any;
declare const game: any;

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

  // S4 (ApplicationV2 + Cytoscape) проверен и подтверждён в реальном Foundry — см. tasks.md.
  // Временное подключение оставлено закомментированным на случай повторной ручной проверки:
  // раскомментировать и запускать из консоли браузера внутри Foundry:
  //   game.modules.get("fvtt-relationship-graph").api.openSpikeS4()
  // Убрать совсем, когда появится реальная точка входа (Scene Controls, задача из tasks.md).
  // const mod = game.modules.get(MODULE_ID);
  // mod.api = mod.api ?? {};
  // mod.api.openSpikeS4 = async () => {
  //   try {
  //     const { SpikeGraphApp } = await import("../spikes/spike-foundry-app");
  //     return new SpikeGraphApp().render(true);
  //   } catch (err) {
  //     console.error(`${MODULE_ID} | spike S4 failed to load`, err);
  //     ui.notifications?.error("Spike S4: не удалось загрузить, см. консоль");
  //     throw err;
  //   }
  // };
});

export {};
