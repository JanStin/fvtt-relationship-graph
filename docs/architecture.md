# Architecture: Foundry VTT Relationship Graph Module

## TL;DR

| Вопрос | Решение |
|--------|---------|
| Графовая библиотека | **Cytoscape.js + fcose layout** — подтверждено спайками S1, S3, S4 |
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

### Выбор: **Cytoscape.js + fcose** — подтверждён спайками S1–S4

Рассматривались три кандидата (сравнение ниже). Cytoscape.js выбран по совокупности архитектурных
плюсов ещё до реализации, а затем подтверждён на практике:
- fcose + compound nodes (фракции) + узлы с разным `scale` — PASS в браузере, фракции
  кластеризуются, наложений нет (docs/architecture.md §10).
- resize одного узла и группы — compound bounds фракции обновляются автоматически, сепарация
  убирает наложения (spikes/spike-resize.html).
- библиотека реально монтируется и работает внутри `ApplicationV2` в живом Foundry —
  после того как нашли и запатчили единственную обнаруженную несовместимость
  (R7: Foundry замораживает `Array.prototype.equals`, см. §11).

D3-force и PIXI.js остаются нереализованными альтернативами: пересматривать выбор нет смысла,
так как все три исходных риска (наложения/кластеризация по фракциям, resize с сохранением
пропорций, интеграция внутрь Foundry) закрыты для Cytoscape.js конкретными спайками, а не только
рассуждениями.

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
  conditions: string[];     // id состояний из справочника
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
  conditions: ConditionDef[]; // свои состояния; встроенные — в core/conditions.ts
}

interface ConditionDef {
  id: string;
  label: string;
  icon: string;             // класс Font Awesome
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

**При ручном перетаскивании**:
Слушаем `cy.on('dragfree', ...)`. После отпускания узла запускаем локальную сепарацию:
1. Проверяем overlap текущего узла со всеми соседями (r1 + r2 > dist).
2. Если есть — отодвигаем затронутые узлы по вектору от центра.
3. Только ближайшие соседи (~O(k), не O(n²)).

**При изменении размера**:
После изменения `scale` запускаем ту же локальную сепарацию для затронутого узла.
Если изменяется группа выделенных — сепарация после применения всех изменений.

См. также раздел [10. Результаты spike S1](#10-результаты-spike-s1) — там описано, что именно проверено по факту (fcose не учитывает размеры узлов, отдельный post-layout pass закрывает это).

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

Полное описание формата входного файла — в [docs/fang-json-format.md](./fang-json-format.md).

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
│   ├── index.ts          # Hooks.on('init'), регистрация модуля и точки входа
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

### Точка входа для пользователя

Пользователь открывает граф через кнопку внизу вкладки Actors в сайдбаре Foundry.
Кнопка добавляется через `Hooks.on('renderActorDirectory', ...)` в `src/foundry/index.ts` —
хук отдаёт `HTMLElement` корня directory-приложения, кнопка вставляется в `.directory-footer`.
Клик по кнопке открывает (повторный клик — закрывает) `GraphApp`.

Изначально кнопка была в Scene Controls (`Hooks.on('getSceneControlButtons', ...)`), но в
реальном Foundry она не открывала окно и не давала ошибок в консоли — вероятно, структура
`controls.tokens.tools` в рантайме v13 не совпадала с ожидаемой (в доках и на форумах
встречаются расхождения между v13/v14). Перенесено на `renderActorDirectory` по прямому
запросу — заодно это более надёжный hook: `html` там всегда конкретный `HTMLElement`
рендернутого directory-приложения, без вложенной структуры контролов, которую сложно
проверить не отходя от живого Foundry.

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
│   index.ts  settings.ts  actors.ts  storage.ts          │
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

## 9. Тестирование layout: только в браузере

Cytoscape.js — браузерная библиотека: расчёт размеров узлов (`outerWidth()`/`outerHeight()`)
опирается на применённые CSS-стили. В headless-окружении (Node.js/Vitest без реального рендера)
стили не применяются, и все узлы получают вырожденный размер 1×1px — это ломает layout-алгоритмы,
завязанные на реальный размер узлов (подробности — в разделе 10).

Поэтому layout (fcose, compound nodes, сепарация с учётом `scale`) нельзя проверить юнит-тестами.
Единственный способ — открыть спайк в настоящем браузере через `spikes/` (см. [spikes/README.md](../spikes/README.md)),
например:

```
npx serve -p 8080
# затем открыть http://localhost:8080/spikes/spike-layout.html
```

Юнит-тестами (Vitest) покрываются только чистые вычисления без рендера: `core/*`, `import/*`.

---

## 10. Результаты spike S1

### Что проверяли

S1 проверял: fcose + compound nodes (фракции как parent-узлы) + узлы с разным `scale` (0.5–3.0).
Тестировались: fcose, cose-bilkent, cola — с compound nodes и без.
Файлы: `spikes/spike-layout.html`, `spikes/spike-layout-check.mjs`.

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

**F4: Compound nodes в браузере — проверено, работают корректно**
Ручная проверка `spikes/spike-layout.html` в браузере: layout не падает, fcose кластеризует
узлы по фракциям, статус PASS (0 наложений) на всём диапазоне `scale` (0.5–3.0).
В браузере CSS-стили применяются, `outerWidth()`/`outerHeight()` возвращают реальные размеры —
вырожденный случай из F1 (headless) здесь не воспроизводится.

**Решение**: используем compound nodes для layout (Вариант B). Раньше это было открытым
вопросом Q1 — закрыт по результатам ручной проверки в браузере.

---

## 11. Известные риски и ограничения

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

**R6: ~~Compound nodes не проверены в реальном браузере~~ — закрыт**
Headless-тесты с compound nodes падают (F1), но ручная проверка в браузере (F4) подтвердила
корректную работу: кластеризация по фракциям, 0 наложений. Compound nodes остаются в layout
(Вариант B). Ограничение по-прежнему в силе: не тестируется headlessly, только вручную через
`spikes/`.

**R7: ~~Cytoscape крашит внутри Foundry~~ — закрыт патчем**
Обнаружено при S4: Foundry VTT замораживает `Array.prototype.equals` (`writable: false,
configurable: false`, часть ядра Foundry). Cytoscape расширяет `Collection.prototype`
(наследник `Array.prototype`) через `Object.assign`-подобную функцию `extend()` и среди прочего
пытается задать алиас `equals` — обычное присваивание уважает цепочку прототипов и падает на
non-writable унаследованном свойстве (`TypeError: Cannot assign to read only property 'equals'`).
Это ломало не только спайк, а вообще любое использование Cytoscape внутри страницы Foundry.

Исправлено патчем через `patch-package` (`patches/cytoscape+3.34.3.patch`): функция `extend()` в
`node_modules/cytoscape/dist/cytoscape.esm.mjs` переписана на `Object.defineProperty` вместо
прямого присваивания — так всегда создаётся собственное свойство, минуя ограничение прототипа.
`postinstall: patch-package` в `package.json` переустанавливает патч после `npm install`.
Патч точечный (одна функция), но привязан к конкретной версии cytoscape — при апдейте версии
патч нужно будет перегенерировать (`npx patch-package cytoscape`) и проверить, что применяется.

---

## 12. Что не делаем

- **Zones и квесты**: убраны из скоупа (FANG-узлы `zones[]` игнорируются при импорте).
- **Экспорт в FANG-формат**: только экспорт в собственный формат модуля.
- **Несколько графов в одной кампании**: один граф на кампанию.
- **Real-time sync между клиентами**: отложено, не в MVP — см. docs/tasks.md.

---

## 13. Дополнительные принятые решения

1. **Zones**: игнорируем при импорте, зоны в новом модуле не нужны.

2. **Множественные фракции**: primary faction (`factionIds[0]`) — фоновый compound node.
   Дополнительные фракции — ромб цвета фракции поверх иконки узла.
   Полный список фракций — в панели деталей (двойной клик по узлу).

3. **Сохранение**: `JournalEntry` с самого начала, без лимита по размеру.

4. **Player view**: игроки и GM видят один и тот же граф.
   Разница только в доступе: у GM есть поле `gmNotes` на каждом узле и отдельный тип связи
   `gmOnly: true`, который не отображается у игроков (рисуется пунктирной линией, видна только GM).
   Отдельного «режима игрока» нет.
