/**
 * Чистая логика группового масштабирования выделенных узлов.
 * Не зависит от Cytoscape — см. docs/architecture.md §5 (resize). Групповое перемещение
 * делает сама Cytoscape (§6), своей логики для него нет.
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
