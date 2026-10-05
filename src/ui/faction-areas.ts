/**
 * Области фракций на живом графе: кто в какой области и какая область выделена. Хранится в
 * scratch экземпляра Cytoscape — у каждой перерисовки графа свой набор.
 *
 * Членство — из core/faction-areas.ts, а не из детей compound-узлов: в режиме "areas" узел входит
 * и в области дополнительных фракций, а compound-родитель у него один (основная фракция).
 * Фракция, которая ни у кого не основная, compound-узла не имеет вовсе — области он и не нужен.
 *
 * id области — id compound-элемента фракции (factionElementId), даже если самого элемента нет.
 */

import type cytoscape from "cytoscape";

export interface FactionArea {
  /** factionElementId фракции. */
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
}

interface AreaState {
  areas: FactionArea[];
  /** id узла → id областей, в которые он входит. */
  areasByNode: Map<string, string[]>;
  selected: Set<string>;
}

const SCRATCH_KEY = "frgFactionAreas";
/** Событие ядра Cytoscape: изменился набор выделенных областей — их надо перерисовать. */
export const AREA_SELECTION_EVENT = "frgareaselection";

export function setFactionAreas(cy: cytoscape.Core, areas: FactionArea[]): void {
  const areasByNode = new Map<string, string[]>();
  areas.forEach((area) =>
    area.nodeIds.forEach((nodeId) => areasByNode.set(nodeId, [...(areasByNode.get(nodeId) ?? []), area.id])),
  );
  const state: AreaState = { areas, areasByNode, selected: new Set() };
  cy.scratch(SCRATCH_KEY, state);
}

function stateOf(cy: cytoscape.Core): AreaState {
  return (cy.scratch(SCRATCH_KEY) as AreaState | undefined) ?? { areas: [], areasByNode: new Map(), selected: new Set() };
}

/** Области в порядке отрисовки. */
export function factionAreaList(cy: cytoscape.Core): readonly FactionArea[] {
  return stateOf(cy).areas;
}

/** Узлы области (те, что есть на графе). */
export function areaMembers(cy: cytoscape.Core, areaId: string): cytoscape.NodeCollection {
  const area = stateOf(cy).areas.find((a) => a.id === areaId);
  const ids = new Set(area?.nodeIds ?? []);
  return cy.nodes("[!isFaction]").filter((node) => ids.has(node.id()));
}

export function isAreaSelected(cy: cytoscape.Core, areaId: string): boolean {
  return stateOf(cy).selected.has(areaId);
}

/**
 * Пересчёт выделения областей узла: область выделена, когда выделены все её узлы — каким бы
 * способом их ни выделили. Изменилось что-то — шлёт AREA_SELECTION_EVENT.
 */
export function refreshAreaSelection(cy: cytoscape.Core, nodeId: string): void {
  const state = stateOf(cy);
  let changed = false;
  (state.areasByNode.get(nodeId) ?? []).forEach((areaId) => {
    const members = areaMembers(cy, areaId);
    const selected = members.nonempty() && members.filter(":selected").length === members.length;
    if (selected === state.selected.has(areaId)) return;
    if (selected) state.selected.add(areaId);
    else state.selected.delete(areaId);
    changed = true;
  });
  if (changed) cy.emit(AREA_SELECTION_EVENT);
}
