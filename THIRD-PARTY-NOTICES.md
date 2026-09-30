# Сторонние компоненты

Сборка модуля (`scripts/`) включает код следующих библиотек. Все они распространяются по
лицензии MIT; полный текст лицензии MIT — в файле `LICENSE` этого репозитория (отличается только
строка copyright).

| Библиотека | Версия | Copyright | Лицензия |
| --- | --- | --- | --- |
| [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) | 3.34.3 | Copyright (c) 2016-2026, The Cytoscape Consortium | MIT |
| [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) | 2.2.0 | Copyright (c) 2018 - present, iVis-at-Bilkent | MIT |
| [cose-base](https://github.com/iVis-at-Bilkent/cose-base) | 2.2.0 | Copyright (c) 2019 - present, iVis@Bilkent | MIT |
| [layout-base](https://github.com/iVis-at-Bilkent/layout-base) | 2.0.1 | Copyright (c) 2019 iVis@Bilkent | MIT |

Cytoscape.js в сборке содержит небольшой патч (`patches/cytoscape+3.34.3.patch`, накладывается
`patch-package` при `npm install`): Foundry VTT замораживает `Array.prototype.equals`, и без патча
Cytoscape падает при загрузке. Подробности — `docs/architecture.md`, риск R7.
