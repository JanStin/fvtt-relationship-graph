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
- [x] `src/ui/interaction.ts` — Alt+wheel resize (одиночный и групповой, через `core/selection.groupScale`), drag группы (`computeGroupMoveDeltas`/`applyGroupMove`), пост-сепарация после resize/dragfree (`core/layout.separateOverlaps`), Esc снимает выделение. Rubber-band + shift-click — нативно (просто `boxSelectionEnabled: true` в graph-renderer.ts). После каждого commit — снэпшот позиций/scale уходит в `GraphApp` → `storage.saveGraphData()`.
  - **Баги, найдены пользователем при ручной проверке — исправления написаны, но НЕ подтверждены:**
    - [x] Alt+wheel ресайзил не только узел, но и всю сцену целиком. Прежний фикс (вызывать `setupInteraction()` до `cytoscape(...)`) был неполным: наш обработчик звал `stopPropagation()`, а он не останавливает другие листенеры **того же** элемента — Cytoscape висит на том же контейнере и всё равно зумила. Теперь `stopImmediatePropagation()` (порядок регистрации тоже по-прежнему важен).
    - **Управление** (код написан, юнит-тесты/сборка проходят; в реальном Foundry **не проверено**). Уточнено у пользователя: в исходном списке ЛКМ и ПКМ были перепутаны — основная кнопка левая, меню на правой. Полное описание — `docs/controls.md`.
    - [x] wheel — масштабирование вида (нативно Cytoscape)
    - [x] Нажатие на wheel — перемещение по виду
    - [x] Alt+wheel — ресайз выбранных узлов (без выделения — узла под курсором)
    - [x] Shift+ЛКМ — выделение нескольких узлов (клик — добавить, drag — рамка)
      - [x] Баг: попытка перемещения нескольких узлов вызывает сильное смещение. Причина: Cytoscape сама двигает все выделенные узлы и шлёт `grab`/`drag` каждому из них, а наш код на каждое такое событие ещё раз переставлял группу (с дельтами относительно другого узла). Свой групповой сдвиг из `interaction.ts` убран, сохранение/сепарация — один раз по `dragfreeon`. `computeGroupMoveDeltas`/`applyGroupMove` в `core/selection.ts` остались, но в UI больше не используются. Не проверено в Foundry.
    - [x] ЛКМ — выделение узла и его перемещение. Клик вне узла — перемещение по виду, даже если клик пришёлся по области (области сделаны «прозрачными» для мыши: `events: no`, попадание в область считает `core/hit-test.ts`)
    - [x] ПКМ — контекстное меню (`src/ui/overlays.ts`; пункты: информация, лист актёра, сброс размера, выбор области, показать весь граф, снять выделение)
    - [x] Ctrl+ЛКМ — перемещение по виду независимо от того, куда нажато
    - [x] Alt+ЛКМ — выбор области (выделяются все узлы фракции, область подсвечивается)
    - [x] Двойной клик ЛКМ — карточка информации об узле/области (`core/describe.ts` + `overlays.ts`, только чтение)
    - Esc теперь слушается на `document` (пока курсор над графом): Cytoscape на mousedown делает blur, фокус на контейнере не держался.
- [x] `src/core/hit-test.ts` + `tests/core/hit-test.test.ts` (6 тестов), `src/core/describe.ts` + `tests/core/describe.test.ts` (7 тестов).
- [ ] `src/ui/panels/NodePanel.ts`.
- [ ] `src/ui/panels/EdgePanel.ts`.
- [x] `src/ui/panels/ImportDialog.ts` — не отдельное окно, а кнопка+file input в тулбаре `GraphApp`: читает файл → `parseFangJson()` → `saveGraphData()` → перерисовка. Уведомления об успехе/warnings через `ui.notifications`.
- [x] Написать readme для описания кнопок и клавиш — `docs/controls.md`.

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
