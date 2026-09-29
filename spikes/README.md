# Spikes

Прототипы для проверки рискованных технических решений вне юнит-тестов
(Cytoscape — браузерная библиотека, headless её не проверить — см.
[docs/architecture.md, раздел 9](../docs/architecture.md#9-тестирование-layout-только-в-браузере)).

| # | Файл | Что проверяет | Статус |
|---|------|----------------|--------|
| S1 | `spike-layout.html`, `spike-layout-check.mjs` | fcose + compound nodes + узлы с разным `scale` | Выполнен headlessly, находки — [docs/architecture.md §10](../docs/architecture.md#10-результаты-spike-s1); ручная проверка в браузере — открытый вопрос [Q1](../docs/open-questions.md#q1-compound-nodes-vs-flat-layout) |
| S2 | `spike-multiselect.html` | Multi-drag нескольких выделенных узлов в Cytoscape | Не начат |
| S3 | `spike-resize.html` | Resize узла + пересчёт границ compound node | Не начат |
| S4 | `spike-foundry-app.ts` | Оболочка `ApplicationV2` для Cytoscape внутри Foundry | Не начат |

Детали — в самих файлах спайков и в `docs/architecture.md` / `docs/tasks.md`.
