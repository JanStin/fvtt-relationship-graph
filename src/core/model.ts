export type NodeType = "actor" | "placeholder" | "image";

export interface GraphNode {
  id: string;
  type: NodeType;
  actorId: string | null; // null если актёр не найден в game.actors; сохраняем name/img
  name: string;
  originalName: string;
  img: string;
  x: number;
  y: number;
  scale: number; // 1.0 по умолчанию; отсутствует в FANG
  primaryFactionId: string | null; // factionIds[0] или null
  factionIds: string[];
  role: string;
  lore: string;
  playerNotes: string;
  gmNotes: string; // заметки GM — не видны игрокам
  conditions: string[]; // id состояний из справочника (core/conditions.ts)
  hidden: boolean;
  gmOnly: boolean;
}

export interface GraphEdge {
  id: string; // генерируем: `${source}-${target}-${index}`
  source: string; // id узла
  target: string; // id узла
  label: string;
  directional: boolean;
  relationshipTypeId: string; // '' если не задан
  gmOnly: boolean;
}

export interface Faction {
  id: string;
  name: string;
  color: string; // hex
  description: string;
}

export interface RelationshipType {
  id: string;
  label: string;
  color: string;
  dash: string; // '' | '8,5' | '4,4' etc.
}

/** Состояние узла в справочнике. Встроенные — в core/conditions.ts, в данных только свои. */
export interface ConditionDef {
  id: string;
  label: string;
  icon: string; // класс Font Awesome: "fa-skull" или набор классов
}

/**
 * Как показывать картинку фона: плиткой (текстура), одним изображением в координатах графа
 * (как карта) или на весь экран — неподвижно, независимо от панорамирования и зума.
 */
export type BackgroundImageMode = "tile" | "single" | "screen";

/**
 * Фон графа (задаёт GM, видят все). Картинка tile/single лежит в координатах графа: двигается и
 * масштабируется вместе с узлами; screen закрывает всю область графа и стоит на месте.
 * Логика — core/background.ts, отрисовка — ui/background-layer.ts.
 */
export interface GraphBackground {
  color: string; // hex; '' — стандартный цвет
  image: string; // путь к картинке; '' — без картинки
  imageMode: BackgroundImageMode;
  imageX: number; // single — левый верхний угол картинки; tile — точка привязки плиток; screen — не используется
  imageY: number;
  imageWidth: number; // ширина картинки (плитки) в единицах графа; 0 — натуральная ширина; screen — не используется
  imageOpacity: number; // 0..1
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  factions: Faction[];
  relationshipTypes: RelationshipType[];
  conditions: ConditionDef[]; // свои состояния; встроенные сюда не входят
  // нет или null — стандартный фон. Сброс хранится как null, а не удалением ключа: setFlag
  // сливает объекты, и удалённый ключ остался бы в хранилище со старым значением.
  background?: GraphBackground | null;
}
