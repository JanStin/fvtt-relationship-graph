# Project: Foundry VTT Relationship Graph Module

Файл локальный (в `.gitignore`) — инструкции для Claude Code, в публичный репозиторий не входит.

## Goal
Модуль для Foundry VTT 13, который отображает связи между актёрами в виде графа.
Аналог: https://github.com/Niclasp1501/Foundry-Actor-Nexus-Graph--FANG- (код и ресурсы FANG не
используем — у FANG проприетарная лицензия; поддерживаем только импорт его файлов экспорта).
Репозиторий: https://github.com/JanStin/fvtt-relationship-graph (ветка `master`).

## Current state
- Версия 1.2.0, всё из исходных требований реализовано. Что сделано — `CHANGELOG.md`,
  планы — `docs/tasks.md`.
- Интерфейс на русском и английском (`lang/ru.json`, `lang/en.json`); язык — из настроек Foundry
  у каждого клиента. Введённое пользователем не переводится.

## Requirements (исходные, выполнены)
1. Функционал FANG: граф связей между персонажами.
2. Изображение без привязки к актёру.
3. Размер узлов (scale): по одному и группой с сохранением пропорций.
4. Выделение нескольких узлов для перемещения.
5. Фракции — фоновым цветом, не линиями.
6. Импорт JSON из FANG (`scale` в FANG нет — при импорте 1.0).
7. Узлы не накладываются: при раскладке, перетаскивании, изменении размера.

## Tech stack
- Foundry VTT 13 (`ApplicationV2`), TypeScript, Vite (library build → `scripts/`)
- Cytoscape.js + cytoscape-fcose (граф), патч `patches/cytoscape+3.34.3.patch` (patch-package)
- Без Handlebars: панели собираются из DOM-кода (`src/ui/panels/form.ts`)
- Локализация: `t("RELGRAPH.…")` / `tn()` для чисел (`src/core/i18n.ts`), переводчик —
  `game.i18n`; строки интерфейса в коде не пишем — только ключи в `lang/*.json`

## Project structure
- `module.json` — манифест (url/manifest/download на GitHub)
- `src/core/` — чистая логика без Foundry/DOM; `src/import/` — FANG и свой формат;
  `src/foundry/` — интеграция (хуки, хранилище, блокировка); `src/ui/` — окно, рендер, панели
- `scripts/` — собранный JS (артефакт сборки, в git не хранится)
- `lang/` — переводы (эталон ключей — `ru.json`); `tools/` — скрипты `i18n:extract` / `i18n:check`
- `styles/module.css`, `assets/placeholder-npc.png` (своя картинка, не из FANG)
- `tests/` — Vitest; `tests/mocks/foundry.ts` — моки Foundry API; `tests/setup/i18n.ts` —
  переводчик из `lang/ru.json`; `tests/fixtures/fang.json` — урезанный экспорт FANG с выдуманными
  именами
- `README.md` (англ.) и `README.ru.md` — описание для пользователей
- `docs/` — архитектура, управление, форматы файлов, планы
- `.github/workflows/` — CI (push/PR) и Release (тег `v*` → `module.zip` + `module.json`)

Подробная карта модулей — `docs/architecture.md` §8.

## Commands
- `npm run build` — сборка в `scripts/`; `npm run dev` — watch.
- `npm run test` / `test:watch` / `test:ui` / `test:coverage` — тесты.
- `npm run typecheck` — проверка типов.
- `npm run i18n:check` — в коде нет кириллических строк, `lang/*.json` совпадают по ключам с
  `ru.json` (запускается в CI); `npm run i18n:extract` — список оставшихся строк.
- Релиз: поднять версию в `module.json`, `package.json`, `CHANGELOG.md` → тег `vX.Y.Z` → push тега.

## Docs
- `docs/architecture.md` — как устроено, риски
- `docs/controls.md` — управление, права игроков
- `docs/fang-json-format.md`, `docs/graph-json-format.md` — форматы импорта/экспорта
- `docs/tasks.md` — планы на следующие версии
- `docs/open-questions.md` — открытые вопросы (сейчас нет)
- `CHANGELOG.md` — история версий

## Rules for Claude
- Не удалять существующие файлы без подтверждения.
- Предлагать изменения пошагово.
- Комментарии в коде — на русском.
- Новые строки интерфейса — ключом в `lang/ru.json` и `lang/en.json` сразу, не литералом в коде.
- Использовать официальное API Foundry VTT.
- Реальные экспорты миров (`fang.json`, `relationship-graph-*.json`) в репозиторий не коммитить —
  они в `.gitignore`.
- Флоу задач: задачи берутся из `docs/tasks.md`. Сделанное остаётся там с отметкой `[x]` (ждёт
  проверки) — в `CHANGELOG.md` не переносить, пока пользователь не подтвердит, что всё работает.
  Переносить в CHANGELOG — только после подтверждения.
