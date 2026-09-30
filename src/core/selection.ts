/**
 * Чистая логика группового масштабирования и перемещения выделенных узлов.
 * Не зависит от Cytoscape — см. docs/architecture.md §5 (resize) и §6 (multi-select drag).
 */

/** Допустимый диапазон scale узла (см. docs/architecture.md §5). */
export const SCALE_MIN = 0.3;
export const SCALE_MAX = 5.0;

export interface ScaledEntity {
  id: string;
  scale: number;
}

export interface GroupScaleOptions {
  min?: number;
  max?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Масштабирует группу узлов, сохраняя относительные пропорции.
 * Коэффициент = requestedTargetScale / текущий scale узла targetId (узла под курсором).
 * Каждый результат независимо клампится в [min, max] — как и сам targetId.
 */
export function groupScale(
  entities: readonly ScaledEntity[],
  targetId: string,
  requestedTargetScale: number,
  options: GroupScaleOptions = {},
): Map<string, number> {
  const { min = SCALE_MIN, max = SCALE_MAX } = options;
  const target = entities.find((e) => e.id === targetId);
  if (!target) {
    throw new Error(`groupScale: entity "${targetId}" not found in entities`);
  }

  const clampedTargetScale = clamp(requestedTargetScale, min, max);
  const coefficient = clampedTargetScale / target.scale;

  const result = new Map<string, number>();
  for (const entity of entities) {
    result.set(entity.id, clamp(entity.scale * coefficient, min, max));
  }
  return result;
}

export interface PositionedEntity {
  id: string;
  x: number;
  y: number;
}

export interface MoveDelta {
  dx: number;
  dy: number;
}

/**
 * Снимок относительных позиций группы в момент начала drag (см. §6: "фиксируем
 * относительные позиции всех выделенных"). Вызывать один раз при dragstart —
 * не пересчитывать на каждый tick перетаскивания, иначе смещения накопят ошибку.
 */
export function computeGroupMoveDeltas(
  entities: readonly PositionedEntity[],
  draggedId: string,
): Map<string, MoveDelta> {
  const dragged = entities.find((e) => e.id === draggedId);
  if (!dragged) {
    throw new Error(`computeGroupMoveDeltas: entity "${draggedId}" not found in entities`);
  }

  const deltas = new Map<string, MoveDelta>();
  for (const entity of entities) {
    deltas.set(entity.id, { dx: entity.x - dragged.x, dy: entity.y - dragged.y });
  }
  return deltas;
}

/**
 * Применяет зафиксированные при dragstart дельты к текущей позиции перетаскиваемого
 * узла. Вызывать на каждый tick перетаскивания (dragmove) с одним и тем же snapshot дельт.
 */
export function applyGroupMove(
  deltas: ReadonlyMap<string, MoveDelta>,
  draggedX: number,
  draggedY: number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  deltas.forEach((delta, id) => {
    positions.set(id, { x: draggedX + delta.dx, y: draggedY + delta.dy });
  });
  return positions;
}
