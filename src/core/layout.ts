/**
 * Чистая логика раздвигания перекрывающихся узлов (post-layout separation pass).
 * Не зависит от Cytoscape — работает с обычными кругами (id/x/y/radius), см. docs/architecture.md §4/§10.
 *
 * Найдено в spike S1 (spikes/spike-layout-check.mjs): ни fcose, ни cose-bilkent не учитывают
 * реальный размер узлов при расчёте сил отталкивания, поэтому наложения крупных узлов
 * устраняет только отдельный проход после layout — не сам layout-движок.
 */

export interface PositionedCircle {
  id: string;
  x: number;
  y: number;
  radius: number;
}

export interface OverlapPair {
  aId: string;
  bId: string;
  distance: number;
  minDistance: number;
  depth: number; // на сколько px круги пересекаются
}

export interface SeparationOptions {
  /** Дополнительный зазор между границами кругов сверх соприкосновения. */
  gap?: number;
  /** Максимум итераций раздвигания до принудительной остановки. */
  maxPasses?: number;
  /**
   * Узлы, которые нельзя двигать (например, тот, что только что перетащили/зарезайзили —
   * он должен остаться там, где его оставил пользователь). Вся коррекция при столкновении
   * с закреплённым узлом ложится на подвижный. Если оба узла закреплены — коррекция не
   * применяется (столкновение остаётся, двигать нечего).
   */
  anchoredIds?: ReadonlySet<string>;
}

export interface SeparationResult {
  positions: Map<string, { x: number; y: number }>;
  passes: number;
  hadOverlaps: boolean;
}

// Раздвигание — итеративная геометрия с плавающей точкой: после схождения между кругами
// может остаться остаточный зазор порядка 1e-10px. Не считаем это пересечением.
const EPSILON = 1e-6;

/** Находит все пары кругов, которые пересекаются (r1 + r2 > dist), с учётом погрешности EPSILON. */
export function findOverlaps(circles: readonly PositionedCircle[], gap = 0): OverlapPair[] {
  const overlaps: OverlapPair[] = [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i];
      const b = circles[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = a.radius + b.radius + gap;
      if (distance < minDistance - EPSILON) {
        overlaps.push({ aId: a.id, bId: b.id, distance, minDistance, depth: minDistance - distance });
      }
    }
  }
  return overlaps;
}

/**
 * Направление от b к a. Если круги точно совпадают по координатам (dist === 0),
 * выбирает детерминированный, но не нулевой вектор на основе индекса пары,
 * чтобы раздвигание не застряло на месте.
 */
function pushDirection(dx: number, dy: number, fallbackSeed: number): { ux: number; uy: number; dist: number } {
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 1e-6) {
    return { ux: dx / dist, uy: dy / dist, dist };
  }
  const angle = (fallbackSeed * 137.50776405) % 360; // золотой угол — избегаем повторов направления
  const rad = (angle * Math.PI) / 180;
  return { ux: Math.cos(rad), uy: Math.sin(rad), dist: 0 };
}

/**
 * Итеративно раздвигает пересекающиеся круги. Не мутирует вход — возвращает новые позиции.
 * Поведение (проверено спайками):
 *  - оба круга подвижны → каждый уходит на половину глубины пересечения (симметрично,
 *    как в spikes/spike-layout-check.mjs — постобработка после автоматического layout);
 *  - один закреплён (anchoredIds) → вся коррекция уходит на подвижный
 *    (как в spikes/spike-resize.html — после ручного drag/resize).
 */
export function separateOverlaps(
  circles: readonly PositionedCircle[],
  options: SeparationOptions = {},
): SeparationResult {
  const { gap = 0, maxPasses = 20, anchoredIds = new Set<string>() } = options;

  const working = new Map<string, { x: number; y: number; radius: number }>(
    circles.map((c) => [c.id, { x: c.x, y: c.y, radius: c.radius }]),
  );
  const ids = circles.map((c) => c.id);

  let passes = 0;
  let hadOverlaps = false;

  for (; passes < maxPasses; passes++) {
    let moved = false;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const aId = ids[i];
        const bId = ids[j];
        const a = working.get(aId)!;
        const b = working.get(bId)!;

        const minDistance = a.radius + b.radius + gap;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const { ux, uy, dist } = pushDirection(dx, dy, i * ids.length + j);

        if (dist >= minDistance - EPSILON) continue;

        hadOverlaps = true;
        const aAnchored = anchoredIds.has(aId);
        const bAnchored = anchoredIds.has(bId);
        if (aAnchored && bAnchored) continue; // некому двигаться

        const overlap = minDistance - dist;

        if (aAnchored) {
          b.x -= ux * overlap;
          b.y -= uy * overlap;
        } else if (bAnchored) {
          a.x += ux * overlap;
          a.y += uy * overlap;
        } else {
          const half = overlap / 2;
          a.x += ux * half;
          a.y += uy * half;
          b.x -= ux * half;
          b.y -= uy * half;
        }
        moved = true;
      }
    }

    if (!moved) {
      passes++;
      break;
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  working.forEach((v, id) => positions.set(id, { x: v.x, y: v.y }));

  return { positions, passes, hadOverlaps };
}
