/**
 * Собирает текстовую сводку об узле/области для карточки информации (двойной клик).
 * Чистая логика поверх GraphData — без DOM и Foundry; GM-only данные отсекаются здесь же.
 */

import { allConditions, conditionLabel } from "./conditions";
import { factionName } from "./edit";
import { t } from "./i18n";
import type { GraphData, NodeType } from "./model";
import { relationshipTypeLabel } from "./relationship-types";
import { displayName, isMasked, nodeName, unknownNodeName } from "./visibility";

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

const NODE_TYPE_KEYS: Record<NodeType, string> = {
  actor: "RELGRAPH.NodeType.Actor",
  placeholder: "RELGRAPH.NodeType.Placeholder",
  image: "RELGRAPH.NodeType.Image",
};

/** Название типа связи по id; '' — тип не задан или удалён. */
function relationshipTypeCaption(data: GraphData, typeId: string): string {
  const type = data.relationshipTypes.find((rt) => rt.id === typeId);
  return type ? relationshipTypeLabel(type) : "";
}

function pushIfPresent(rows: DescriptionRow[], label: string, value: string): void {
  if (value.trim() !== "") rows.push({ label, value });
}

/** null — узла с таким id нет. */
export function describeNode(data: GraphData, nodeId: string, options: DescribeOptions): Description | null {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const nameById = new Map(data.nodes.map((n) => [n.id, displayName(n, options.isGM)]));
  const typeLabelById = new Map(data.relationshipTypes.map((rt) => [rt.id, relationshipTypeLabel(rt)]));
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
    pushIfPresent(rows, t("RELGRAPH.Node.Connections", { count: connections.length }), connections.join("\n"));
    rows.push({ label: t("RELGRAPH.Common.Size"), value: `×${node.scale.toFixed(1)}` });
    return { title: unknownNodeName(), rows };
  }

  const rows: DescriptionRow[] = [];
  pushIfPresent(rows, t("RELGRAPH.Common.Role"), node.role);

  const factions = node.factionIds
    .map((id) => data.factions.find((f) => f.id === id))
    .filter((f) => f !== undefined);
  // Единственная фракция и так основная — помечаем, только когда есть из чего выбирать.
  const factionNames = factions.map((f) =>
    factions.length > 1 && f.id === node.primaryFactionId ? t("RELGRAPH.Node.PrimaryMark", { name: factionName(f) }) : factionName(f),
  );
  pushIfPresent(rows, t("RELGRAPH.Common.Factions"), factionNames.join(", "));
  const conditionLabels = new Map(allConditions(data).map((c) => [c.id, conditionLabel(c)]));
  pushIfPresent(rows, t("RELGRAPH.Common.Conditions"), node.conditions.map((id) => conditionLabels.get(id) ?? id).join(", "));
  pushIfPresent(rows, t("RELGRAPH.Node.Connections", { count: connections.length }), connections.join("\n"));

  pushIfPresent(rows, t("RELGRAPH.Common.Description"), node.lore);
  pushIfPresent(rows, t("RELGRAPH.Node.Notes"), node.playerNotes);
  if (options.isGM) {
    pushIfPresent(rows, t("RELGRAPH.Node.GmNotes"), node.gmNotes);
    // hidden включает gmOnly — показываем более сильный из флагов
    if (node.hidden) rows.push({ label: t("RELGRAPH.Common.Visibility"), value: t("RELGRAPH.Node.Hidden") });
    else if (node.gmOnly) rows.push({ label: t("RELGRAPH.Common.Visibility"), value: t("RELGRAPH.Node.GmOnly") });
  }
  rows.push({ label: t("RELGRAPH.Common.Size"), value: `×${node.scale.toFixed(1)}` });

  return { title: nodeName(node), subtitle: t(NODE_TYPE_KEYS[node.type]), rows };
}

/**
 * Карточка связи — в режиме просмотра, где панель связи не открывается.
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
  rows.push({ label: t("RELGRAPH.Edge.Ends"), value: `${nameOf(edge.source)} ${edge.directional ? "→" : "—"} ${nameOf(edge.target)}` });
  pushIfPresent(rows, t("RELGRAPH.Edge.TypeShort"), relationshipTypeCaption(data, edge.relationshipTypeId));
  if (edge.gmOnly) rows.push({ label: t("RELGRAPH.Common.Visibility"), value: t("RELGRAPH.Edge.GmOnly") });

  return { title: edge.label || t("RELGRAPH.Common.Edge"), subtitle: edge.label ? t("RELGRAPH.Common.Edge") : undefined, rows };
}

/** null — фракции с таким id нет. */
export function describeFaction(data: GraphData, factionId: string, options: DescribeOptions): Description | null {
  const faction = data.factions.find((f) => f.id === factionId);
  if (!faction) return null;

  const rows: DescriptionRow[] = [];
  pushIfPresent(rows, t("RELGRAPH.Common.Description"), faction.description);

  // У скрытого узла игрок видит только основную фракцию (область) — остальные не выдаём.
  const members = data.nodes
    .filter((n) => (isMasked(n, options.isGM) ? n.primaryFactionId === factionId : n.factionIds.includes(factionId)))
    .map((n) => displayName(n, options.isGM));
  pushIfPresent(rows, t("RELGRAPH.Faction.Members", { count: members.length }), members.join("\n"));

  return { title: factionName(faction), subtitle: t("RELGRAPH.Faction.Panel"), rows };
}
