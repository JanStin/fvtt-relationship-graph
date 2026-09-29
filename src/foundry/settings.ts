/**
 * Настройки модуля через game.settings.
 * Пока без конкретных настроек — только регистрируемая точка расширения.
 * Добавлять через game.settings.register(MODULE_ID, "key", {...}) по мере
 * появления реальных нужд из UI-задач (docs/tasks.md).
 */

export const MODULE_ID = "fvtt-relationship-graph";

export function registerSettings(): void {
  // Намеренно пусто.
}
