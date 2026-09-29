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
  conditions: string[];
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
  visible: boolean;
}

export interface RelationshipType {
  id: string;
  label: string;
  color: string;
  dash: string; // '' | '8,5' | '4,4' etc.
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  factions: Faction[];
  relationshipTypes: RelationshipType[];
}
