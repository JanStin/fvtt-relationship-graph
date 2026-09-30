/**
 * Собирает текстовую сводку об узле/области для карточки информации (двойной клик).
 * Чистая логика поверх GraphData — без DOM и Foundry; GM-only данные отсекаются здесь же.
 */

import { allConditions } from "./conditions";
import type { GraphData, NodeType } from "./model";
import { displayName, isMasked, UNKNOWN_NODE_NAME } from "./visibility";

export interface DescriptionRow {
  label: string;
  value: string;
}

export interface Description {
  title: string;
  subtitle?: string;
  rows: DescriptionRow[];
}

export interface DescribeOptions {
  /** GM видит gmNotes, gmOnly-связи и настоящие данные hidden-узлов. */
  isGM: boolean;
}

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  actor: "Актёр",
  placeholder: "Без актёра",
  image: "Изображение",
};

function pushIfPresent(rows: DescriptionRow[], label: string, value: string): void {
  if (value.trim() !== "") rows.push({ label, value });
}

/** null — узла с таким id нет. */
export function describeNode(data: GraphData, nodeId: string, options: DescribeOptions): Description | null {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const nameById = new Map(data.nodes.map((n) => [n.id, displayName(n, options.isGM)]));
  const typeLabelById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt.label]));
  const connections = data.edges
    .filter((e) => (e.source === nodeId || e.target === nodeId) && (options.isGM || !e.gmOnly))
    .map((e) => {
      const outgoing = e.source === nodeId;
      const otherName = nameById.get(outgoing ? e.target : e.source) ?? "?";
      const arrow = e.directional ? (outgoing ? "→" : "←") : "—";
      const caption = e.label || typeLabelById.get(e.relationshipTypeId) || "";
      return caption ? `${arrow} ${otherName}: ${caption}` : `${arrow} ${otherName}`;
    });

  // Скрытый узел у игрока — «неизвестный»: только то, что и так видно на графе (связи, размер).
  if (isMasked(node, options.isGM)) {
    const rows: DescriptionRow[] = [];
    pushIfPresent(rows, `Связи (${connections.length})`, connections.join("\n"));
    rows.push({ label: "Размер", value: `×${node.scale.toFixed(1)}` });
    return { title: UNKNOWN_NODE_NAME, rows };
  }

  const rows: DescriptionRow[] = [];
  pushIfPresent(rows, "Роль", node.role);

  const factions = node.factionIds
    .map((id) => data.factions.find((f) => f.id === id))
    .filter((f) => f !== undefined);
  // Единственная фракция и так основная — помечаем, только когда есть из чего выбирать.
  const factionNames = factions.map((f) =>
    factions.length > 1 && f.id === node.primaryFactionId ? `${f.name} (основная)` : f.name,
  );
  pushIfPresent(rows, "Фракции", factionNames.join(", "));
  const conditionLabels = new Map(allConditions(data).map((c) => [c.id, c.label]));
  pushIfPresent(rows, "Состояния", node.conditions.map((id) => conditionLabels.get(id) ?? id).join(", "));
  pushIfPresent(rows, `Связи (${connections.length})`, connections.join("\n"));

  pushIfPresent(rows, "Описание", node.lore);
  pushIfPresent(rows, "Заметки", node.playerNotes);
  if (options.isGM) {
    pushIfPresent(rows, "Заметки GM", node.gmNotes);
    // hidden включает gmOnly — показываем более сильный из флагов
    if (node.hidden) rows.push({ label: "Видимость", value: "Скрыт от игроков" });
    else if (node.gmOnly) rows.push({ label: "Видимость", value: "Правит только GM" });
  }
  rows.push({ label: "Размер", value: `×${node.scale.toFixed(1)}` });

  return { title: node.name, subtitle: NODE_TYPE_LABELS[node.type], rows };
}

/**
 * Карточка связи — в режиме просмотра (B15), где панель связи не открывается.
 * null — связи нет или она gmOnly, а смотрит игрок.
 */
export function describeEdge(data: GraphData, edgeId: string, options: DescribeOptions): Description | null {
  const edge = data.edges.find((e) => e.id === edgeId);
  if (!edge || (edge.gmOnly && !options.isGM)) return null;

  const nameOf = (id: string) => {
    const node = data.nodes.find((n) => n.id === id);
    return node ? displayName(node, options.isGM) : "?";
  };
  const rows: DescriptionRow[] = [];
  rows.push({ label: "Кто с кем", value: `${nameOf(edge.source)} ${edge.directional ? "→" : "—"} ${nameOf(edge.target)}` });
  pushIfPresent(rows, "Тип", data.relationshipTypes.find((rt) => rt.id === edge.relationshipTypeId)?.label ?? "");
  if (edge.gmOnly) rows.push({ label: "Видимость", value: "Видна только GM" });

  return { title: edge.label || "Связь", subtitle: edge.label ? "Связь" : undefined, rows };
}

/** null — фракции с таким id нет. */
export function describeFaction(data: GraphData, factionId: string, options: DescribeOptions): Description | null {
  const faction = data.factions.find((f) => f.id === factionId);
  if (!faction) return null;

  const rows: DescriptionRow[] = [];
  pushIfPresent(rows, "Описание", faction.description);

  // У скрытого узла игрок видит только основную фракцию (область) — остальные не выдаём.
  const members = data.nodes
    .filter((n) => (isMasked(n, options.isGM) ? n.primaryFactionId === factionId : n.factionIds.includes(factionId)))
    .map((n) => displayName(n, options.isGM));
  pushIfPresent(rows, `Участники (${members.length})`, members.join("\n"));

  return { title: faction.name, subtitle: "Фракция", rows };
}
