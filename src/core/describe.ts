/**
 * Собирает текстовую сводку об узле/связи/области для панели сведений (panels/InfoPanel.ts).
 * Чистая логика поверх GraphData — без DOM и Foundry; GM-only данные отсекаются здесь же.
 */

import { allConditions, conditionLabel } from "./conditions";
import { factionName } from "./edit";
import { t } from "./i18n";
import { normalizeImageAlign } from "./image-align";
import type { GraphData, GraphNode, ImageAlign, ImageFit, NodeType } from "./model";
import { normalizeImageFit } from "./node-image";
import { parseDash, relationshipTypeLabel } from "./relationship-types";
import { displayName, isMasked, nodeName, unknownNodeName } from "./visibility";

export interface DescriptionRow {
  label: string;
  value: string;
}

/** Миниатюра узла — как он нарисован на графе. */
export interface Portrait {
  /** '' — заглушка (пустой путь или скрытый узел у игрока). */
  img: string;
  fit: ImageFit;
  align: ImageAlign;
  /** Цвет рамки — основной фракции; null — нейтральная. */
  border: string | null;
}

/** Картинка в шапке сведений: портрет узла, два конца связи или цвет фракции. */
export type DescriptionHeader =
  | { kind: "node"; portrait: Portrait; role: string }
  | {
      kind: "edge";
      source: Portrait;
      target: Portrait;
      directional: boolean;
      /** Цвет типа связи; null — тип не задан. */
      color: string | null;
      /** Штрих типа связи; null — сплошная (у gmOnly-связи — свой пунктир, как на графе). */
      dash: number[] | null;
      gmOnly: boolean;
    }
  | { kind: "faction"; color: string };

export interface Description {
  title: string;
  subtitle?: string;
  header: DescriptionHeader;
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

/** Миниатюра узла; скрытый узел у игрока — заглушка, без настоящей картинки и цвета фракции. */
function portraitOf(data: GraphData, node: GraphNode | undefined, isGM: boolean): Portrait {
  if (!node || isMasked(node, isGM)) return { img: "", fit: "cover", align: "center", border: null };
  const primary = node.primaryFactionId ? data.factions.find((f) => f.id === node.primaryFactionId) : undefined;
  return {
    img: node.img,
    fit: normalizeImageFit(node.imageFit),
    align: normalizeImageAlign(node.imageAlign),
    border: primary?.color ?? null,
  };
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

  const portrait = portraitOf(data, node, options.isGM);
  // Скрытый узел у игрока — «неизвестный»: только то, что и так видно на графе (связи, размер).
  if (isMasked(node, options.isGM)) {
    const rows: DescriptionRow[] = [];
    pushIfPresent(rows, t("RELGRAPH.Node.Connections", { count: connections.length }), connections.join("\n"));
    rows.push({ label: t("RELGRAPH.Common.Size"), value: `×${node.scale.toFixed(1)}` });
    return { title: unknownNodeName(), header: { kind: "node", portrait, role: "" }, rows };
  }

  // роль — в шапке, под именем и типом
  const rows: DescriptionRow[] = [];

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

  return {
    title: nodeName(node),
    subtitle: t(NODE_TYPE_KEYS[node.type]),
    header: { kind: "node", portrait, role: node.role.trim() },
    rows,
  };
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

  const type = data.relationshipTypes.find((rt) => rt.id === edge.relationshipTypeId);
  const nodeById = (id: string) => data.nodes.find((n) => n.id === id);
  const header: DescriptionHeader = {
    kind: "edge",
    source: portraitOf(data, nodeById(edge.source), options.isGM),
    target: portraitOf(data, nodeById(edge.target), options.isGM),
    directional: edge.directional,
    color: type?.color || null,
    dash: parseDash(type?.dash ?? ""),
    gmOnly: edge.gmOnly,
  };

  return {
    title: edge.label || t("RELGRAPH.Common.Edge"),
    subtitle: edge.label ? t("RELGRAPH.Common.Edge") : undefined,
    header,
    rows,
  };
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

  return {
    title: factionName(faction),
    subtitle: t("RELGRAPH.Faction.Panel"),
    header: { kind: "faction", color: faction.color },
    rows,
  };
}
