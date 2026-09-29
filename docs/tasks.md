# Tasks

Формат: `[ ]` не начато · `[~]` в работе · `[x]` сделано · `[!]` заблокировано.

---

## Спайки

- [x] **S1. fcose + compound nodes + scale.** Проверено headless и в браузере (`spikes/spike-layout.html`): PASS, фракции кластеризуются, наложений нет. Compound nodes оставляем в layout.
- [ ] **S2. Multi-drag в Cytoscape.** Файл: `spikes/spike-multiselect.html`. Заметка: при drag compound-узла (фракции) дочерние узлы уже двигаются вместе — это встроенное поведение Cytoscape, не то же самое, что multi-select произвольных узлов (shift-click/rubber-band) с последующим drag. Требование 4 из CLAUDE.md ещё не проверено, спайк остаётся не начатым.
- [x] **S3. Resize узла + compound bounds.** Проверено в браузере (`spikes/spike-resize.html`): одиночный и групповой resize работают, compound bbox фракции обновляется автоматически, сепарация убирает наложения.
- [x] **S4. ApplicationV2 + Cytoscape.** Проверено в реальном Foundry: окно ApplicationV2 открывается, граф монтируется и рендерится внутри него. По пути нашли и запатчили конфликт Cytoscape с Foundry (`Array.prototype.equals`, см. Инфраструктура → patch-package, architecture.md R7). Временное подключение (`api.openSpikeS4()`) закомментировано в `src/main.ts` — раскомментировать для повторной ручной проверки, убрать совсем при реализации реальной точки входа (Scene Controls).

---

## Инфраструктура

- [ ] `tests/mocks/foundry.ts` — моки `game`, `canvas`, `ui`, `Hooks`, `Actor`, `Token`.
- [ ] `tests/fixtures/fang.json` — копия тестовых данных.
- [x] `patch-package` + `patches/cytoscape+3.34.3.patch` — фикс конфликта Cytoscape с
  замороженным `Array.prototype.equals` в Foundry (найдено на S4, см. architecture.md R7).
  `postinstall` в package.json переустанавливает патч после `npm install`.

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

## E2E (ручной чек-лист, подход не выбран — см. "Отложено" ниже)

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
