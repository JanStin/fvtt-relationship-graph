# Architecture: Foundry VTT Relationship Graph Module

## TL;DR

| Вопрос | Решение |
|--------|---------|
| Графовая библиотека | **Cytoscape.js + fcose layout** |
| Модель данных | Отдельные типы `GraphNode`, `GraphEdge`, `Faction`; поле `scale: number` на узле |
| Хранение позиций | Свободные координаты `x, y` на каждом узле |
| Фракции | Compound nodes в Cytoscape (узлы-родители с фоновым цветом) |
| Коллизии | fcose встроенный `nodeRepulsion` + сепарация после ручного дрэга |
| Resize | Колесо мыши + shift-клик для группы; после resize — пересчёт минимальных расстояний |
| Multi-select | Cytoscape rubber-band + shift-click; drag группы с фиксированными относительными позициями |
| Импорт FANG | Чистая функция `parseFangJson()` в `src/import/fang.ts` |
| Хранение данных | `JournalEntry` (без лимита размера) |
| Foundry-интеграция | `ApplicationV2` (Foundry v13 API) как оболочка |

---

## 1. Графовая библиотека

### Кандидаты

**Cytoscape.js**
- Встроенный HTML/Canvas рендер, CSS-like стили узлов и рёбер.
- Compound nodes: узел может быть «родителем» других узлов — фракция рисуется как фоновый прямоугольник/круг с заливкой.
- fcose layout: кластеризует compound-узлы, имеет `nodeRepulsion` и `idealEdgeLength`.
- Нативная rubber-band selection и drag.
- ~300 KB minified (core) + ~100 KB fcose — приемлемо для Foundry модуля.
- Активно поддерживается, отличная документация.

**D3-force**
- Минимальный рендер (~50 KB), полный контроль.
- Нет compound nodes из коробки — фракционный фон нужно рисовать вручную (SVG rect/convex hull).
- `forceCollide` — хорошее обнаружение коллизий, но нет кластеризации по группам.
- Rubber-band и drag придётся писать самостоятельно.
- Много кастомного кода для всех требований.

**PIXI.js (как в FANG)**
- Самый быстрый рендер, подходит для 500+ узлов.
- Полностью кастомная физика, layout, selection — огромный объём работы.
- Нет готового layout с кластеризацией по фракциям.
- Оправдан только при жёстких требованиях к производительности.

### Выбор: **Cytoscape.js + fcose**

Compound nodes покрывают требование «фракции фоновым цветом» практически бесплатно.
fcose автоматически кластеризует узлы внутри compound-родителей и имеет встроенный `nodeRepulsion`.
Rubber-band selection — нативная фича Cytoscape, не нужно писать вручную.
D3 и PIXI потребуют реализовывать эти фичи с нуля, что резко увеличивает объём работы при тех же рисках.

**Ограничение**: узел в нескольких фракциях (`factionIds.length > 1`) не может иметь двух compound-родителей.
Решение: primary faction = `factionIds[0]` определяет compound-родителя. Дополнительные фракции отображаются как ромб цвета фракции поверх иконки узла. Полный список — в панели деталей (двойной клик по узлу).

---

## 2. Модель данных

```typescript
// src/core/model.ts

type NodeType = 'actor' | 'placeholder' | 'image';

interface GraphNode {
  id: string;
  type: NodeType;
  actorId: string | null;   // null если актёр не найден в game.actors; сохраняем name/img
  name: string;
  originalName: string;
  img: string;
  x: number;
  y: number;
  scale: number;            // 1.0 по умолчанию; отсутствует в FANG
  primaryFactionId: string | null;  // factionIds[0] или null
  factionIds: string[];
  role: string;
  lore: string;
  playerNotes: string;
  gmNotes: string;          // заметки GM — не видны игрокам
  conditions: string[];
  hidden: boolean;
  gmOnly: boolean;
}

interface GraphEdge {
  id: string;               // генерируем: `${source}-${target}-${index}`
  source: string;           // id узла
  target: string;           // id узла
  label: string;
  directional: boolean;
  relationshipTypeId: string; // '' если не задан
  gmOnly: boolean;
}

interface Faction {
  id: string;
  name: string;
  color: string;            // hex
  description: string;
  visible: boolean;
}

interface RelationshipType {
  id: string;
  label: string;
  color: string;
  dash: string;             // '' | '8,5' | '4,4' etc.
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  factions: Faction[];
  relationshipTypes: RelationshipType[];
}
```

**Почему `scale`, а не `radius`**: scale — относительный множитель, не зависит от базового размера иконки.
Это проще при изменении группы: умножаем все `scale` на одинаковый коэффициент, пропорции сохраняются.

**Хранение позиций**: свободные координаты `x, y` на узле, не привязка к compound.
Compound node в Cytoscape хранит собственную позицию/размер как bounding box дочерних — это автоматически.

**Связь с Foundry**: `actorId` — это ID актёра в `game.actors`.
Узел типа `actor` имеет `actorId !== null`. При открытии графа синхронизируем `img` и `name` из реального актёра.
Если актёр не найден в `game.actors` — обнуляем `actorId`, но сохраняем все данные узла (`name`, `img`, `role` и т.д.) без изменений.

---

## 3. Layout и группировка

### Компоновка фракций

Каждая фракция становится **compound node** в Cytoscape:
- id: `faction-${faction.id}`
- стиль: `background-color: faction.color`, `background-opacity: 0.15`, `border-color: faction.color`
- метка: название фракции (внизу или сверху)

Узел с `primaryFactionId` получает `parent: 'faction-<id>'` в Cytoscape.
Узлы без фракции — на корневом уровне.

**Почему не convex hull**: convex hull нужно перерисовывать при каждом движении (overlay SVG/Canvas).
Compound node в Cytoscape обновляется автоматически и участвует в layout.

**Пересечение подложек**: fcose раздвигает compound nodes (`compoundPadding`, `tileFractals`).
Дополнительно: если фракция имеет `padding: 30px`, то между фракциями всегда есть зазор.

**Смена фракции у узла**: обновляем `parent` через `node.move({ parent: newParentId })`.
Cytoscape плавно пересчитывает bounds compound node. Анимированный переход — через `node.animate({ position })` после layout.

---

## 4. Предотвращение наложения

**При автоматическом layout**:
fcose имеет `nodeRepulsion: 4500` (по умолчанию), `nodeSeparation: 75`, `nestingFactor: 0.1`.
Для узлов с `scale > 1` передаём `nodeOverlap: 10` и учитываем реальный радиус: `baseRadius * scale`.

Spike нужен: проверить, корректно ли fcose учитывает размер узлов при разных `scale`.

**При ручном перетаскивании**:
Слушаем `cy.on('dragfree', ...)`. После отпускания узла запускаем локальную сепарацию:
1. Проверяем overlap текущего узла со всеми соседями (r1 + r2 > dist).
2. Если есть — отодвигаем затронутые узлы по вектору от центра.
3. Только ближайшие соседи (~O(k), не O(n²)).

**При изменении размера**:
После изменения `scale` запускаем ту же локальную сепарацию для затронутого узла.
Если изменяется группа выделенных — сепарация после применения всех изменений.

**Пост-обработка не нужна**: fcose сам предотвращает наложения при initial layout.
Пост-обработка нужна только для drag и resize.

---

## 5. Изменение размера узлов

**Один узел**:
- `Alt + колесо мыши` над узлом → изменяем `scale` с шагом 0.1 (min 0.3, max 5.0).
- Альтернатива: правый клик → контекстное меню → слайдер размера.
- Колесо удобнее для быстрой подстройки в процессе работы.
- `Ctrl` не используем — это стандартный зум браузера.

**Группа выделенных**:
- `Alt + колесо мыши` над любым выделенным узлом → множим все `scale` на коэффициент.
- Коэффициент = `newScale / oldScale` первого узла, применяем ко всем.
- Относительные пропорции сохраняются: `nodeB.scale *= coefficient`.

**После изменения размера**:
1. Обновляем Cytoscape `node.style({ width, height })` = `BASE_SIZE * scale`.
2. Запускаем локальную сепарацию.
3. Обновляем compound node bounds (Cytoscape делает это автоматически).

---

## 6. Выделение и перемещение нескольких узлов

**Выделение**:
- Click: одиночный узел.
- Shift+click: добавление к выделению.
- Rubber-band (drag по пустому месту): выделение прямоугольником. Cytoscape нативно.
- `Esc`: снятие выделения.

**Drag группы**:
- При начале drag одного из выделенных узлов — фиксируем относительные позиции всех выделенных.
- Drag двигает все выделенные, сохраняя `delta_x[i] = node[i].x - draggedNode.x`.
- Реализация: `cy.on('drag', ...)` → `selectedNodes.forEach(n => n.position(basePos + delta[n.id]))`.
- После отпускания — сепарация от невыделенных узлов (не между собой, чтобы не разрушить группу).

**Конфликт с Foundry**:
Граф открывается в `ApplicationV2` поверх сцены, в отдельном `div`.
Событийная модель Foundry (токены на сцене) и Cytoscape (узлы в graphApp) не пересекаются — разные DOM-поддеревья.
Пока модальный граф открыт, клики по сцене Foundry заблокированы.

---

## 7. Импорт FANG JSON

### Парсер: `src/import/fang.ts`

Чистые функции, нет зависимостей от Foundry/DOM — полностью тестируемо в Vitest.

```typescript
// src/import/fang.ts

export function parseFangJson(raw: unknown): ParseResult {
  // валидация верхнего уровня
  // nodes → GraphNode[] с добавлением scale: 1.0
  // links → GraphEdge[] с генерацией id, проверкой source/target
  // factions → Faction[]
  // relationshipTypes → RelationshipType[]
  // zones — игнорируем
  // битые ссылки в links → в warnings[], не бросаем ошибку
}

interface ParseResult {
  data: GraphData;
  warnings: string[];  // битые ссылки, неизвестные поля
}
```

**Маппинг полей**:
| FANG поле | Наше поле | Примечание |
|-----------|-----------|------------|
| `id` | `id` | |
| `actorId` | `actorId` | null если placeholder |
| `isPlaceholder: true` + `actorId: null` | `type: 'placeholder'` | |
| `isPlaceholder: false` + `actorId` | `type: 'actor'` | |
| — | `scale` | дефолт 1.0 |
| `factionId` | `primaryFactionId` | deprecated field, используем factionIds[0] |
| `factionIds[0]` | `primaryFactionId` | |
| `vx`, `vy` | — | сбрасываем, не переносим |
| `zoneId` | — | игнорируем |
| `zones[]` | — | игнорируем |
| `showFactionLines` | — | игнорируем (у нас фон вместо линий) |

**Обнаружение "псевдо-placeholder"**: в FANG есть узлы с `isPlaceholder: false` и id начинающимся на `ph-`,
но с реальным `actorId`. Это просто alias — маппим их как `type: 'actor'`.

**Nodes с `actorId` != `id`** (например `ph-cJE1vbnje3TjgBhO` с `actorId: RFAt0Lri14I8tRTR`):
Это «именованные» узлы с привязкой к актёру. Сохраняем оба id, `type: 'actor'`.

---

## 8. Архитектура кода

```
src/
├── core/
│   ├── model.ts          # типы GraphNode, GraphEdge, Faction, GraphData
│   ├── graph-state.ts    # мутации состояния: addNode, removeEdge, moveFaction...
│   ├── layout.ts         # параметры fcose, локальная сепарация (pure functions)
│   └── selection.ts      # логика выделения, groupScale, groupMove
│
├── import/
│   └── fang.ts           # parseFangJson() → ParseResult (no Foundry deps)
│
├── foundry/
│   ├── index.ts          # Hooks.on('init'), module registration
│   ├── settings.ts       # game.settings.register (настройки UI, не GraphData)
│   ├── actors.ts         # Actor.get(), синхронизация img/name с актёрами
│   └── storage.ts        # save/load GraphData через JournalEntry
│
└── ui/
    ├── GraphApp.ts        # class GraphApp extends ApplicationV2
    ├── graph-renderer.ts  # инициализация Cytoscape, стили, event wiring
    ├── interaction.ts     # drag, resize (scale), rubber-band, context menu
    └── panels/
        ├── NodePanel.ts   # боковая панель редактирования узла
        ├── EdgePanel.ts   # панель редактирования связи
        └── ImportDialog.ts # диалог импорта FANG JSON

tests/
├── mocks/
│   └── foundry.ts        # моки game, Hooks, Actor
├── import/
│   └── fang.test.ts      # тесты парсера FANG
├── core/
│   ├── layout.test.ts    # тесты сепарации, коллизий
│   └── selection.test.ts # тесты groupScale, groupMove
└── fixtures/
    └── fang.json         # копия тестовых данных
```

### Почему такое разделение

**`core/` не зависит от Foundry**:
- Логику сепарации узлов, вычисление scale для группы, маппинг данных можно
  тестировать в чистом Vitest без jsdom и без моков Foundry.
- Если Foundry API изменится в v14 — правим только `foundry/`, не трогаем `core/`.

**`import/` отдельно от `core/`**:
- Парсер FANG — единственный код, знающий о чужом формате.
- Изолирован: в тестах подаём raw JSON, проверяем ParseResult.
- При добавлении импорта из другого источника — добавляем `src/import/other.ts`.

**`ui/` зависит от `core/` и `foundry/`**:
- `GraphApp` получает данные через `storage.ts`, рендерит через `graph-renderer.ts`.
- UI не содержит бизнес-логики — только wiring событий.

**Что тестируется без Foundry**: `core/*`, `import/*` — чистые функции.
**Что тестируется с моками**: `foundry/actors.ts`, `foundry/storage.ts`.
**Что не покрывается юнит-тестами**: `ui/` (рендер Cytoscape) — e2e или ручное тестирование.

---

## ASCII-диаграмма слоёв

```
┌─────────────────────────────────────────────────────────┐
│                    Foundry VTT Runtime                  │
│  game.actors  game.settings  Hooks  ApplicationV2  etc. │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   src/foundry/                          │
│   hooks.ts  settings.ts  actors.ts  storage.ts          │
│   (интеграция с Foundry API, сохранение/загрузка)       │
└──────┬─────────────────────────────────────┬────────────┘
       │                                     │
┌──────▼──────────┐                 ┌────────▼────────────┐
│   src/import/   │                 │      src/ui/        │
│   fang.ts       │                 │  GraphApp           │
│   (парсер FANG) │                 │  graph-renderer.ts  │
└──────┬──────────┘                 │  interaction.ts     │
       │                            │  panels/            │
       │        ┌───────────────────┤                     │
       │        │                   └─────────────────────┘
       ▼        ▼
┌──────────────────────────────────────────────────────────┐
│                      src/core/                          │
│   model.ts  graph-state.ts  layout.ts  selection.ts     │
│   (чистая логика, нет зависимостей от Foundry/DOM)      │
└──────────────────────────────────────────────────────────┘
       ▲
┌──────┴──────────────────────────────────────────────────┐
│                      tests/                             │
│   import/fang.test.ts  core/*.test.ts                   │
│   (Vitest, без jsdom для core/import)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 9. Риски и открытые вопросы

### Риски

**R1: Compound nodes + multi-faction**
Узел не может иметь двух parent в Cytoscape. В тестовых данных большинство узлов в одной фракции,
но требование хранить `factionIds[]` существует. При импорте берём `factionIds[0]` как primary,
остальные отображаем как бейдж. Это осознанное ограничение, не баг.

**R2: ~~fcose и кастомные scale~~ — закрыт по результатам S1**
Проверено: fcose не учитывает реальные размеры узлов при расчёте сил отталкивания.
Overlap prevention обеспечивается через post-layout separation pass. См. раздел 10.

**R3: Bundle size**
Cytoscape.js (core) + fcose extension суммарно ~400 KB после gzip ~120 KB.
Для Foundry это нормально (сам PIXI.js в Foundry Core весит несколько MB).

**R4: ApplicationV2 API**
Foundry v13 переходит на `ApplicationV2` — нужно убедиться, что API стабилизировалось.
FANG использует старый `Application` API. Если `ApplicationV2` имеет проблемы — fallback на `Application`.

**R5: Drag группы и Cytoscape**
Cytoscape нативно не поддерживает drag нескольких узлов с сохранением относительных позиций.
Нужно написать кастомный обработчик. Сложность: не входит в конфликт со встроенным drag отдельного узла.
**Spike**: реализовать multi-drag для 5-10 узлов, проверить производительность и артефакты.

### Spike-задачи (до полной реализации)

| # | Задача | Статус | Файл |
|---|--------|--------|------|
| S1 | fcose + compound nodes + разные scale | ✅ Выполнен, см. раздел 10 | `spikes/spike-layout.html`, `spikes/spike-layout-check.mjs` |
| S2 | Multi-drag в Cytoscape | ⏳ Следующий | `spikes/spike-multiselect.html` |
| S3 | Resize узла + обновление compound bounds | ⏳ | `spikes/spike-resize.html` |
| S4 | ApplicationV2 оболочка для Cytoscape | ⏳ | `spikes/spike-foundry-app.ts` |

### Решённые вопросы

1. **Zones**: игнорируем при импорте, зоны в новом модуле не нужны.

2. **Множественные фракции**: primary faction (`factionIds[0]`) — фоновый compound node.
   Дополнительные фракции — ромб цвета фракции поверх иконки узла.
   Полный список фракций — в панели деталей (двойной клик по узлу).

3. **Сохранение**: `JournalEntry` с самого начала, без лимита по размеру.

4. **Player view**: игроки и GM видят один и тот же граф.
   Разница только в доступе: у GM есть поле `gmNotes` на каждом узле и отдельный тип связи
   `gmOnly: true`, который не отображается у игроков (рисуется пунктирной линией, видна только GM).
   Отдельного «режима игрока» нет.

5. **Редактирование и синхронизация**: редактировать могут и игроки, и GM, но только один пользователь за раз (lock-based).
   Пока узел редактируется — другие видят индикатор «редактируется».
   После сохранения узла — немедленный broadcast через Foundry `socket`, все клиенты обновляют вид
   (даже если «глобальное редактирование» не завершено).

### Что не делаем

- **Zones и квесты**: убраны из скоупа.
- **Экспорт в FANG-формат**: только экспорт в собственный формат модуля.
- **Несколько графов в одной кампании**: один граф на кампанию.

---

## 10. Результаты spike S1 и открытые архитектурные вопросы

### Что проверяли

S1 проверял: fcose + compound nodes (фракции как parent-узлы) + узлы с разным `scale` (0.5–3.0).
Тестировались: fcose, cose-bilkent, cola — с compound nodes и без.

### Находки

**F1: Compound nodes → crash в Node.js headless**
`cose-base.shiftToLastRow` падает с `TypeError: Cannot read properties of undefined (reading 'length')`
при любом compound node (воспроизводится на 1 фракции + 2 дочерних узла).
Причина: в headless-режиме Cytoscape не вычисляет CSS-стили, все узлы = 1×1px,
алгоритм tiling получает вырожденный случай.
Затронуты: **fcose** и **cose-bilkent** (оба используют одну и ту же `cose-base`).
`cola` с compound nodes падает в OOM (бесконечный цикл).

**F2: Layouts не учитывают размер узлов**
Ни fcose, ни cose-bilkent не включают `width`/`height` в расчёт сил отталкивания —
они работают чисто топологически. Повышение `nodeRepulsion` не устраняет оверлапы крупных узлов.

**F3: Post-layout separation pass решает задачу**
Flat layout (без compound) + итеративный алгоритм раздвигания (push-apart) даёт 0 оверлапов.
Работает headlessly и не зависит от layout-движка. Покрывает случаи: initial layout, drag, resize.

**F4: Статус compound nodes в браузере — не проверен**
В браузере CSS-стили применяются, `outerWidth()` возвращает реальные размеры.
Compound nodes с cose-base могут работать корректно. Требует проверки вручную через `spikes/spike-layout.html`.

### Открытые вопросы для решения

**Q1: Использовать ли Cytoscape compound nodes вообще?**

Вариант A — **Отказаться от compound nodes для layout**:
- Flat fcose layout (все узлы на корневом уровне, без `parent`)
- Фракционный фон рисуется отдельным слоем (Canvas или `<div>`) по bounding box / convex hull координат членов
- Пересчитывается после layout, drag, resize
- Плюсы: нет crash, полностью тестируемо headlessly, convex hull выглядит лучше прямоугольника
- Минусы: fcose не кластеризует узлы по фракциям автоматически (нужно добавить `groupBy` constraint или начальные позиции)

Вариант B — **Оставить compound nodes, принять ограничения**:
- Compound nodes используются только в браузере, не в тестах
- layout-тесты пишем только для separation pass и core-логики
- Плюсы: fcose сам кластеризует по фракциям, меньше кода
- Минусы: нельзя тестировать layout headlessly, зависимость от cose-base не крашится только в браузере

**Q2: Нужна ли кластеризация по фракциям при flat layout?**

Если выбираем вариант A, fcose расположит узлы по топологии (рёбра), а не по фракциям.
Узлы одной фракции окажутся рядом только если между ними много рёбер.
Варианты обеспечить кластеризацию без compound:
- Добавить «невидимые» рёбра между членами одной фракции с высоким `idealEdgeLength`
- Задавать начальные позиции (`randomize: false`) по группам перед layout
- Использовать `fcose` constraint API (`fixedNodeConstraint`, `alignmentConstraint`)

**Q3: Стоит ли проверить compound nodes в реальном браузере до принятия решения?**

Открыть `spikes/spike-layout.html` в браузере и проверить:
- Есть ли crash с compound nodes
- Корректно ли fcose кластеризует по фракциям
- Есть ли оверлапы у крупных узлов

Если в браузере всё работает — можно выбрать вариант B с явным ограничением «только не для headless-тестов».
