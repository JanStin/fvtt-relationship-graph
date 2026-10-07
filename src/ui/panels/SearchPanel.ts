/**
 * Панель поиска: одно поле ищет сразу по узлам и связям, результаты — общим списком
 * (сначала узлы, затем связи). Клик по строке — выделить элемент и показать его на графе,
 * панель при этом остаётся открытой.
 * Как и остальные панели — только DOM; сам поиск — core/search.ts, выделение — GraphApp.
 */

import { t } from "../../core/i18n";
import type { GraphData } from "../../core/model";
import { isEmptyQuery, searchGraph } from "../../core/search";
import { displayName, isMasked } from "../../core/visibility";
import { DEFAULT_NODE_IMG } from "../graph-renderer";
import { hint, panelHeader, textInput } from "./form";

export interface SearchTarget {
  kind: "node" | "edge";
  id: string;
}

export interface SearchPanelCallbacks {
  /** Запрос изменился (в том числе стал пустым). */
  onQuery(query: string): void;
  onPick(target: SearchTarget): void;
  onClose(): void;
}

export interface SearchPanelOptions {
  isGM: boolean;
  /** Поставить фокус в поле (открытие пользователем, а не восстановление после перерисовки). */
  focus: boolean;
}

export function createSearchPanel(
  data: GraphData,
  query: string,
  callbacks: SearchPanelCallbacks,
  options: SearchPanelOptions,
): HTMLElement {
  const { isGM } = options;
  const element = document.createElement("div");
  element.className = "frg-panel";

  const input = textInput(query, t("RELGRAPH.Search.Placeholder"));
  input.type = "search";
  input.className = "frg-search-input";

  const body = document.createElement("div");
  body.className = "frg-panel-body";

  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const nameOf = (nodeId: string) => {
    const node = nodesById.get(nodeId);
    return node ? displayName(node, isGM) : "?";
  };

  const row = (target: SearchTarget, ...content: HTMLElement[]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "frg-search-row";
    button.append(...content);
    button.addEventListener("click", () => callbacks.onPick(target));
    return button;
  };
  const text = (className: string, value: string) => {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = value;
    return span;
  };

  const renderResults = () => {
    body.replaceChildren();
    if (isEmptyQuery(input.value)) {
      body.append(hint(t("RELGRAPH.Search.Empty")));
      return;
    }
    const result = searchGraph(data, input.value, isGM);
    if (result.nodeIds.length === 0 && result.edgeIds.length === 0) {
      body.append(hint(t("RELGRAPH.Search.NothingFound")));
      return;
    }
    for (const nodeId of result.nodeIds) {
      const node = nodesById.get(nodeId)!;
      const masked = isMasked(node, isGM);
      const thumb = document.createElement("img");
      thumb.className = "frg-search-thumb";
      thumb.src = (masked ? "" : node.img) || DEFAULT_NODE_IMG;
      thumb.alt = "";
      const info = document.createElement("span");
      info.className = "frg-search-info";
      info.append(text("frg-search-name", displayName(node, isGM)));
      if (!masked && node.role.trim() !== "") info.append(text("frg-field-hint", node.role));
      body.append(row({ kind: "node", id: nodeId }, thumb, info));
    }
    for (const edgeId of result.edgeIds) {
      const edge = data.edges.find((e) => e.id === edgeId)!;
      const info = document.createElement("span");
      info.className = "frg-search-info";
      const ends = `${nameOf(edge.source)} ${edge.directional ? "→" : "—"} ${nameOf(edge.target)}`;
      info.append(text("frg-search-name", edge.label), text("frg-field-hint", ends));
      body.append(row({ kind: "edge", id: edgeId }, info));
    }
  };

  input.addEventListener("input", () => {
    renderResults();
    callbacks.onQuery(input.value);
  });

  const search = document.createElement("div");
  search.className = "frg-search-field";
  search.append(input);

  element.append(panelHeader(t("RELGRAPH.Search.Panel"), callbacks.onClose), search, body);
  renderResults();
  if (options.focus) setTimeout(() => input.focus());
  return element;
}
