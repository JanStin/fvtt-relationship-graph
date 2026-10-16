/**
 * Собирает сведения об узле/связи/области для панели сведений (panels/InfoPanel.ts): шапку и
 * блоки — текст, чипы (фракции, состояния), ссылки на узлы (связи, участники, концы связи).
 * Чистая логика поверх GraphData — без DOM и Foundry; GM-only данные отсекаются здесь же.
 */

import { allConditions, conditionIconClass, conditionLabel } from "./conditions";
import { factionName } from "./edit";
import { t } from "./i18n";
import { normalizeImageAlign } from "./image-align";
import type { GraphData, GraphEdge, GraphNode, ImageAlign, ImageFit, NodeType } from "./model";
import { normalizeImageFit } from "./node-image";
import { canEditNode } from "./permissions";
import { parseDash, relationshipTypeLabel } from "./relationship-types";
import { displayName, isMasked, nodeName, unknownNodeName } from "./visibility";

/** Связей больше — список связей узла группируется по типу связи. */
export const LINK_GROUP_THRESHOLD = 8;

/** Элемент графа, сведения о котором можно открыть (совместим с GraphTarget из ui/interaction.ts). */
export interface InfoTarget {
  kind: "node" | "edge" | "faction";
  id: string;
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

/** Чип: фракция (кружок цвета, клик — её сведения) или состояние (иконка). */
export interface InfoChip {
  label: string;
  color?: string;
  /** Классы Font Awesome. */
  icon?: string;
  /** Основная фракция узла — выделяется, когда фракций несколько. */
  primary?: boolean;
  /** Клик показывает сведения этого элемента. */
  target?: InfoTarget;
}

/** Направление связи относительно узла, чьи сведения открыты. */
export type LinkDirection = "out" | "in" | "none";

/** Строка-ссылка на узел: клик — его сведения, наведение — подсветка узла (и связи) на графе. */
export interface InfoLink {
  /** Имя узла (скрытый у игрока — «Неизвестный»). */
  label: string;
  /** Подпись связи или название её типа; у участника фракции — роль. */
  caption: string;
  nodeId: string;
  /** Связь, через которую пришли к узлу; null — участник фракции, конец связи. */
  edgeId: string | null;
  direction: LinkDirection;
  /** Полоска перед строкой — цвет и штрих типа связи; null — без полоски. */
  stroke: { color: string | null; dash: number[] | null; gmOnly: boolean } | null;
  /** Миниатюра узла слева (участник фракции, конец связи); null — строка связи, без миниатюры. */
  portrait: Portrait | null;
}

/** Группа связей одного типа. */
export interface InfoLinkGroup {
  /** Название типа; связи без типа — «Без типа». */
  label: string;
  color: string | null;
  links: InfoLink[];
}

export type DescriptionBlock =
  | { kind: "text"; label: string; text: string }
  | { kind: "chips"; label: string; chips: InfoChip[] }
  /** groups — связей больше LINK_GROUP_THRESHOLD: те же links, разложенные по типам. */
  | { kind: "links"; label: string; links: InfoLink[]; groups?: InfoLinkGroup[] };

/** Значок видимости в шапке (только GM). */
export interface VisibilityBadge {
  /** Класс иконки Font Awesome. */
  icon: string;
  label: string;
}

export interface Description {
  title: string;
  subtitle?: string;
  header: DescriptionHeader;
  visibility?: VisibilityBadge;
  blocks: DescriptionBlock[];
  /** Показать нечего; hint — как заполнить (тому, кто может править узел). */
  empty?: { hint: string | null };
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

function pushText(blocks: DescriptionBlock[], label: string, text: string): void {
  if (text.trim() !== "") blocks.push({ kind: "text", label, text });
}

/** Ссылка на узел без связи: участник фракции, конец связи — с миниатюрой, как в поиске. */
function nodeLink(data: GraphData, node: GraphNode, isGM: boolean): InfoLink {
  return {
    label: displayName(node, isGM),
    caption: isMasked(node, isGM) ? "" : node.role.trim(),
    nodeId: node.id,
    edgeId: null,
    direction: "none",
    stroke: null,
    portrait: portraitOf(data, node, isGM),
  };
}

/** Связи узла: строки-ссылки на соседей; больше LINK_GROUP_THRESHOLD — ещё и по группам типов. */
function connectionsBlock(data: GraphData, nodeId: string, isGM: boolean): DescriptionBlock | null {
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]));
  const typeById = new Map(data.relationshipTypes.map((rt) => [rt.id, rt]));
  const edges = data.edges.filter((e) => (e.source === nodeId || e.target === nodeId) && (isGM || !e.gmOnly));
  if (edges.length === 0) return null;

  const linkOf = (edge: GraphEdge): InfoLink => {
    const outgoing = edge.source === nodeId;
    const other = nodeById.get(outgoing ? edge.target : edge.source);
    const type = typeById.get(edge.relationshipTypeId);
    return {
      label: other ? displayName(other, isGM) : "?",
      caption: edge.label || (type ? relationshipTypeLabel(type) : ""),
      nodeId: other?.id ?? "",
      edgeId: edge.id,
      direction: edge.directional ? (outgoing ? "out" : "in") : "none",
      stroke: { color: type?.color || null, dash: parseDash(type?.dash ?? ""), gmOnly: edge.gmOnly },
      portrait: null,
    };
  };
  const links = edges.map(linkOf);
  const block: DescriptionBlock = { kind: "links", label: t("RELGRAPH.Node.Connections", { count: links.length }), links };
  if (links.length <= LINK_GROUP_THRESHOLD) return block;

  // Группы — в порядке справочника типов, связи без типа (или удалённого) — последними.
  const groups: InfoLinkGroup[] = [];
  for (const type of data.relationshipTypes) {
    const grouped = edges.filter((e) => e.relationshipTypeId === type.id).map(linkOf);
    if (grouped.length > 0) groups.push({ label: relationshipTypeLabel(type), color: type.color || null, links: grouped });
  }
  const untyped = edges.filter((e) => !typeById.has(e.relationshipTypeId)).map(linkOf);
  if (untyped.length > 0) groups.push({ label: t("RELGRAPH.Info.NoType"), color: null, links: untyped });
  return { ...block, groups };
}

/** null — узла с таким id нет. */
export function describeNode(data: GraphData, nodeId: string, options: DescribeOptions): Description | null {
  const node = data.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const portrait = portraitOf(data, node, options.isGM);
  const connections = connectionsBlock(data, nodeId, options.isGM);

  // Скрытый узел у игрока — «неизвестный»: только то, что и так видно на графе (связи).
  if (isMasked(node, options.isGM)) {
    return {
      title: unknownNodeName(),
      header: { kind: "node", portrait, role: "" },
      blocks: connections ? [connections] : [],
      empty: connections ? undefined : { hint: null },
    };
  }

  // Порядок — по важности: текст о персонаже, затем принадлежность, затем длинный список связей.
  // Роль — в шапке, под именем и типом.
  const blocks: DescriptionBlock[] = [];
  pushText(blocks, t("RELGRAPH.Common.Description"), node.lore);
  pushText(blocks, t("RELGRAPH.Node.Notes"), node.playerNotes);
  if (options.isGM) pushText(blocks, t("RELGRAPH.Node.GmNotes"), node.gmNotes);

  const factions = node.factionIds
    .map((id) => data.factions.find((f) => f.id === id))
    .filter((f) => f !== undefined);
  if (factions.length > 0) {
    blocks.push({
      kind: "chips",
      label: t("RELGRAPH.Common.Factions"),
      chips: factions.map((f) => ({
        label: factionName(f),
        color: f.color,
        // единственная фракция и так основная — выделяем, только когда есть из чего выбирать
        primary: factions.length > 1 && f.id === node.primaryFactionId,
        target: { kind: "faction", id: f.id },
      })),
    });
  }

  const conditionById = new Map(allConditions(data).map((c) => [c.id, c]));
  if (node.conditions.length > 0) {
    blocks.push({
      kind: "chips",
      label: t("RELGRAPH.Common.Conditions"),
      chips: node.conditions.map((id) => {
        const condition = conditionById.get(id);
        return { label: condition ? conditionLabel(condition) : id, icon: conditionIconClass(condition?.icon ?? "") };
      }),
    });
  }
  if (connections) blocks.push(connections);

  // hidden включает gmOnly — показываем более сильный из флагов
  let visibility: VisibilityBadge | undefined;
  if (options.isGM && node.hidden) visibility = { icon: "fa-eye-slash", label: t("RELGRAPH.Node.Hidden") };
  else if (options.isGM && node.gmOnly) visibility = { icon: "fa-user-lock", label: t("RELGRAPH.Node.GmOnly") };

  const role = node.role.trim();
  const empty = blocks.length === 0 && role === "";
  return {
    title: nodeName(node),
    subtitle: t(NODE_TYPE_KEYS[node.type]),
    header: { kind: "node", portrait, role },
    visibility,
    blocks,
    empty: empty ? { hint: canEditNode(node, options.isGM) ? t("RELGRAPH.Info.EmptyEditHint") : null } : undefined,
  };
}

/**
 * Сведения о связи. null — связи нет или она gmOnly, а смотрит игрок.
 */
export function describeEdge(data: GraphData, edgeId: string, options: DescribeOptions): Description | null {
  const edge = data.edges.find((e) => e.id === edgeId);
  if (!edge || (edge.gmOnly && !options.isGM)) return null;

  const nodeById = (id: string) => data.nodes.find((n) => n.id === id);
  const ends = [nodeById(edge.source), nodeById(edge.target)].filter((n) => n !== undefined);
  const type = data.relationshipTypes.find((rt) => rt.id === edge.relationshipTypeId);

  const blocks: DescriptionBlock[] = [];
  if (ends.length > 0) {
    blocks.push({ kind: "links", label: t("RELGRAPH.Edge.Ends"), links: ends.map((n) => nodeLink(data, n, options.isGM)) });
  }
  if (type) {
    blocks.push({
      kind: "chips",
      label: t("RELGRAPH.Edge.TypeShort"),
      chips: [{ label: relationshipTypeLabel(type), color: type.color || undefined }],
    });
  }

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
    visibility: edge.gmOnly ? { icon: "fa-eye-slash", label: t("RELGRAPH.Edge.GmOnly") } : undefined,
    blocks,
  };
}

/** null — фракции с таким id нет. */
export function describeFaction(data: GraphData, factionId: string, options: DescribeOptions): Description | null {
  const faction = data.factions.find((f) => f.id === factionId);
  if (!faction) return null;

  const blocks: DescriptionBlock[] = [];
  pushText(blocks, t("RELGRAPH.Common.Description"), faction.description);

  // У скрытого узла игрок видит только основную фракцию (область) — остальные не выдаём.
  const members = data.nodes
    .filter((n) => (isMasked(n, options.isGM) ? n.primaryFactionId === factionId : n.factionIds.includes(factionId)))
    .map((n) => nodeLink(data, n, options.isGM));
  if (members.length > 0) {
    blocks.push({ kind: "links", label: t("RELGRAPH.Faction.Members", { count: members.length }), links: members });
  }

  return {
    title: factionName(faction),
    subtitle: t("RELGRAPH.Faction.Panel"),
    header: { kind: "faction", color: faction.color },
    blocks,
    empty: blocks.length === 0 ? { hint: null } : undefined,
  };
}
