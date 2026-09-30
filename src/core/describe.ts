/**
 * Собирает текстовую сводку об узле/области для карточки информации (двойной клик).
 * Чистая логика поверх GraphData — без DOM и Foundry; GM-only данные отсекаются здесь же.
 */

import { allConditions } from "./conditions";
import type { GraphData, NodeType } from "./model";

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
  /** GM видит gmNotes и gmOnly-связи. */
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

  const nameById = new Map(data.nodes.map((n) => [n.id, n.name]));
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
  pushIfPresent(rows, `Связи (${connections.length})`, connections.join("\n"));

  pushIfPresent(rows, "Описание", node.lore);
  pushIfPresent(rows, "Заметки", node.playerNotes);
  if (options.isGM) pushIfPresent(rows, "Заметки GM", node.gmNotes);
  rows.push({ label: "Размер", value: `×${node.scale.toFixed(1)}` });

  return { title: node.name, subtitle: NODE_TYPE_LABELS[node.type], rows };
}

/** null — фракции с таким id нет. */
export function describeFaction(data: GraphData, factionId: string): Description | null {
  const faction = data.factions.find((f) => f.id === factionId);
  if (!faction) return null;

  const rows: DescriptionRow[] = [];
  pushIfPresent(rows, "Описание", faction.description);

  const members = data.nodes.filter((n) => n.factionIds.includes(factionId)).map((n) => n.name);
  pushIfPresent(rows, `Участники (${members.length})`, members.join("\n"));

  return { title: faction.name, subtitle: "Фракция", rows };
}
