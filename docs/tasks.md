# Tasks

Формат: `[ ]` не начато · `[~]` в работе · `[x]` сделано · `[!]` заблокировано.

---

## Спайки

- [x] **S1. fcose + compound nodes + scale.** Проверено headless. В браузере не проверено — см. Q1.
- [ ] **S2. Multi-drag в Cytoscape.** Файл: `spikes/spike-multiselect.html`.
- [ ] **S3. Resize узла + compound bounds.** Файл: `spikes/spike-resize.html`.
- [ ] **S4. ApplicationV2 + Cytoscape.** Файл: `spikes/spike-foundry-app.ts`.

---

## Инфраструктура

- [ ] `tests/mocks/foundry.ts` — моки `game`, `canvas`, `ui`, `Hooks`, `Actor`, `Token`.
- [ ] `tests/fixtures/fang.json` — копия тестовых данных.

---

## Парсер FANG

- [ ] `parseFangJson()` в `src/import/fang.ts`.
- [ ] `tests/import/fang.test.ts`.

---

## Core

- [ ] `src/core/model.ts` — типы.
- [ ] `src/core/graph-state.ts` — мутации.
- [ ] `src/core/layout.ts` — параметры fcose + separation pass.
- [ ] `src/core/selection.ts` — groupScale, groupMove.
- [ ] `tests/core/layout.test.ts`.
- [ ] `tests/core/selection.test.ts`.

---

## Foundry

- [ ] `src/foundry/index.ts` — `Hooks.on('init')`.
- [ ] Кнопка в Scene Controls (`getSceneControlButtons`) → открывает `GraphApp`.
- [ ] `src/foundry/settings.ts` — настройки UI.
- [ ] `src/foundry/actors.ts` — синхронизация `img`/`name`.
- [ ] `src/foundry/storage.ts` — save/load через JournalEntry.

---

## UI

- [ ] `src/ui/GraphApp.ts` — ApplicationV2.
- [ ] `src/ui/graph-renderer.ts` — Cytoscape init.
- [ ] `src/ui/interaction.ts` — drag, resize, rubber-band, context menu.
- [ ] `src/ui/panels/NodePanel.ts`.
- [ ] `src/ui/panels/EdgePanel.ts`.
- [ ] `src/ui/panels/ImportDialog.ts`.

---

## E2E (ручной чек-лист, см. Q3)

- [ ] Модуль грузится без ошибок.
- [ ] Кнопка в Scene Controls появляется.
- [ ] Клик открывает граф.
- [ ] Импорт `fang.json` работает.
- [ ] Resize одного узла.
- [ ] Resize группы.
- [ ] Drag группы.
- [ ] Смена фракции.
- [ ] Save → reload → граф восстановился.

## Отложено

- Real-time sync между пользователями. Не в MVP. Один редактор за раз, последний сохранивший побеждает.
- E2E-подход (Playwright / чек-лист / гибрид). Решить после того, как граф заработает в браузере.
