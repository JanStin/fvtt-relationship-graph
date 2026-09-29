# Tasks

Формат: `[ ]` не начато · `[~]` в работе · `[x]` сделано · `[!]` заблокировано.

---

## Спайки

- [x] **S1. fcose + compound nodes + scale.** Проверено headless и в браузере (`spikes/spike-layout.html`): PASS, фракции кластеризуются, наложений нет. Compound nodes оставляем в layout.
- [x] **S2. Multi-drag в Cytoscape.** Файл: `spikes/spike-multiselect.html`. Заметка: при drag compound-узла (фракции) дочерние узлы уже двигаются вместе — это встроенное поведение Cytoscape, не то же самое, что multi-select произвольных узлов (shift-click/rubber-band) с последующим drag. Требование 4 из CLAUDE.md ещё не проверено, спайк остаётся не начатым.
- [x] **S3. Resize узла + compound bounds.** Проверено в браузере (`spikes/spike-resize.html`): одиночный и групповой resize работают, compound bbox фракции обновляется автоматически, сепарация убирает наложения.
- [x] **S4. ApplicationV2 + Cytoscape.** Проверено в реальном Foundry: окно ApplicationV2 открывается, граф монтируется и рендерится внутри него. По пути нашли и запатчили конфликт Cytoscape с Foundry (`Array.prototype.equals`, см. Инфраструктура → patch-package, architecture.md R7). Временное подключение (`api.openSpikeS4()`) закомментировано в `src/main.ts` — раскомментировать для повторной ручной проверки, убрать совсем при реализации реальной точки входа (Scene Controls).

---

## Инфраструктура

- [x] `tests/mocks/foundry.ts` — моки `game.actors`/`game.journal`/`game.modules`, `Hooks`, `ui.notifications`, `JournalEntry`. `canvas`/`Token` пока не нужны (нет кода, который их трогает) — добавить, когда появится синхронизация с токенами на сцене.
- [x] `tests/fixtures/fang.json` — урезанная фикстура (покрывает actor/placeholder/псевдо-placeholder/без фракции/битые ссылки), плюс отдельный smoke-тест на реальный корневой `fang.json`.
- [x] `@types/node` + `tsconfig.json` → `types: ["vitest/globals", "node"]` (понадобилось для `node:fs`/`__dirname` в тестах).
- [x] `patch-package` + `patches/cytoscape+3.34.3.patch` — фикс конфликта Cytoscape с
  замороженным `Array.prototype.equals` в Foundry (найдено на S4, см. architecture.md R7).
  `postinstall` в package.json переустанавливает патч после `npm install`.

---

## Парсер FANG

- [x] `parseFangJson()` в `src/import/fang.ts`.
- [x] `tests/import/fang.test.ts` (15 тестов, включая парсинг реального корневого `fang.json`).

---

## Core

- [x] `src/core/model.ts` — типы.
- [x] `src/core/graph-state.ts` — addNode/removeNode/updateNode, addEdge/removeEdge/updateEdge, moveFaction. Immutable, не мутирует вход. `tests/core/graph-state.test.ts` (19 тестов).
- [x] `src/core/layout.ts` — separation pass (`findOverlaps`/`separateOverlaps`), портировано из `spikes/spike-layout-check.mjs` и `spike-resize.html`. Параметры самого fcose (nodeRepulsion и т.д.) живут в `graph-renderer.ts` (UI), не здесь — это Cytoscape-специфичная конфигурация, а не чистая логика.
- [x] `src/core/selection.ts` — groupScale, computeGroupMoveDeltas/applyGroupMove.
- [x] `tests/core/layout.test.ts` (10 тестов).
- [x] `tests/core/selection.test.ts` (9 тестов).

---

## Foundry

- [x] `src/foundry/index.ts` — `Hooks.once('init'/'ready')`, регистрация.
- [x] Кнопка внизу вкладки Actors (`renderActorDirectory`, вставка в `.directory-footer`) → открывает/закрывает `GraphApp` (toggle через `foundry.applications.instances`). Видна всем, не только GM (см. architecture.md §13 "Player view"). `GraphApp` грузится лениво (`import()`) по клику — cytoscape+fcose весят ~860 KB, незачем тянуть их при каждом старте мира. Изначально пробовали Scene Controls (`getSceneControlButtons`) — окно не открывалось без ошибок в консоли, перенесли на `renderActorDirectory` по запросу (подробности — architecture.md, "Точка входа для пользователя").
- [x] `src/foundry/settings.ts` — по решению: пока только `registerSettings()`-плейсхолдер без конкретных настроек.
- [x] `src/foundry/actors.ts` — синхронизация `img`/`name`. `tests/foundry/actors.test.ts` (4 теста).
- [x] `src/foundry/storage.ts` — save/load через flag на JournalEntry (`game.journal.getName` + `JournalEntry.create`). `tests/foundry/storage.test.ts` (5 тестов).
- [x] `src/main.ts` переписан в тонкий бутстрап (`import "./foundry"`) — вся логика теперь в `src/foundry/index.ts` по архитектуре. Закомментированный debug-хук спайка S4 убран — сделал своё дело.

---

## UI

- [x] `src/ui/GraphApp.ts` — ApplicationV2, по образцу проверенного `spikes/spike-foundry-app.ts`, но с реальными данными (storage → actors sync → renderGraph).
- [x] `src/ui/graph-renderer.ts` — Cytoscape+fcose init, compound-фракции, базовые стили узлов/рёбер (cvет ребра по relationshipType, стрелка по directional). **Пока без drag/resize/rubber-band** — это следующий пункт.
- [ ] `src/ui/interaction.ts` — drag, resize, rubber-band, context menu. Использует уже готовые `core/layout.ts` (separation) и `core/selection.ts` (groupScale/groupMove) — их осталось подключить к реальным Cytoscape-событиям.
- [ ] `src/ui/panels/NodePanel.ts`.
- [ ] `src/ui/panels/EdgePanel.ts`.
- [x] `src/ui/panels/ImportDialog.ts` — не отдельное окно, а кнопка+file input в тулбаре `GraphApp`: читает файл → `parseFangJson()` → `saveGraphData()` → перерисовка. Уведомления об успехе/warnings через `ui.notifications`.

Подтверждено вручную в реальном Foundry: кнопка внизу вкладки Actors открывает `GraphApp` без ошибок (граф изначально пуст, пока не импортирован fang.json).

---

## E2E (ручной чек-лист, подход не выбран — см. "Отложено" ниже)

- [x] Модуль грузится без ошибок.
- [x] Кнопка внизу вкладки Actors появляется.
- [x] Клик открывает граф.
- [ ] Импорт `fang.json` работает.
- [ ] Resize одного узла.
- [ ] Resize группы.
- [ ] Drag группы.
- [ ] Смена фракции.
- [ ] Save → reload → граф восстановился.

## Отложено

- Real-time sync между пользователями. Не в MVP. Один редактор за раз, последний сохранивший побеждает.
- E2E-подход (Playwright / чек-лист / гибрид). Решить после того, как граф заработает в браузере.
