/**
 * Расстановка подписей связей без наложений. Подпись стоит на своей связи (по умолчанию —
 * в середине); если там она перекрывает уже расставленную подпись, сдвигается вдоль связи
 * в ближайшее свободное место. Чистая геометрия — к Cytoscape её подключает ui/edge-labels.ts.
 *
 * Модель упрощённая: связь — прямой отрезок между краями узлов-кругов, подпись —
 * горизонтальный прямоугольник с центром на этом отрезке.
 */

export interface LabelEdge {
  id: string;
  /** Центры и радиусы узлов-концов. */
  source: { x: number; y: number; radius: number };
  target: { x: number; y: number; radius: number };
  /** Размер подписи. Связь без подписи (width 0) в расстановке не участвует. */
  labelWidth: number;
  labelHeight: number;
}

export interface LabelLayoutOptions {
  /** Шаг перебора позиций вдоль связи. */
  step?: number;
  /** Минимальный зазор между подписями. */
  gap?: number;
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DEFAULT_STEP = 10;
const DEFAULT_GAP = 2;

function intersects(a: Box, b: Box, gap: number): boolean {
  return a.x1 < b.x2 + gap && b.x1 < a.x2 + gap && a.y1 < b.y2 + gap && b.y1 < a.y2 + gap;
}

/** Шрифт подписи связи между узлами scale = 1.0. */
export const EDGE_LABEL_BASE_FONT_SIZE = 8;
const EDGE_LABEL_MIN_FONT_SIZE = 6;
const EDGE_LABEL_MAX_FONT_SIZE = 24;

/**
 * Шрифт подписи связи растёт вместе с узлами: базовый размер × средний scale концов,
 * в пределах 6–24 px (у самых мелких узлов подпись остаётся читаемой, у крупных — не огромной).
 */
export function edgeLabelFontSize(sourceScale: number, targetScale: number): number {
  const size = (EDGE_LABEL_BASE_FONT_SIZE * (sourceScale + targetScale)) / 2;
  const clamped = Math.min(EDGE_LABEL_MAX_FONT_SIZE, Math.max(EDGE_LABEL_MIN_FONT_SIZE, size));
  // десятые доли — чтобы не дёргать стиль Cytoscape из-за погрешностей float
  return Math.round(clamped * 10) / 10;
}

/** Оценка размера подписи по тексту: точная ширина зависит от шрифта, здесь — с запасом. */
export function estimateLabelSize(text: string, fontSize: number): { width: number; height: number } {
  if (text.trim() === "") return { width: 0, height: 0 };
  return { width: text.length * fontSize * 0.6 + 6, height: fontSize * 1.2 + 4 };
}

/**
 * Возвращает для каждой связи смещение подписи от края узла-источника вдоль связи.
 * Порядок edges задаёт приоритет: первая связь получает середину, следующие уступают.
 * Если свободного места на связи нет, подпись остаётся в середине (наложение неизбежно).
 */
export function layoutEdgeLabels(edges: readonly LabelEdge[], options: LabelLayoutOptions = {}): Map<string, number> {
  const step = options.step ?? DEFAULT_STEP;
  const gap = options.gap ?? DEFAULT_GAP;
  const placed: Box[] = [];
  const offsets = new Map<string, number>();

  for (const edge of edges) {
    const dx = edge.target.x - edge.source.x;
    const dy = edge.target.y - edge.source.y;
    const distance = Math.hypot(dx, dy);
    const length = Math.max(0, distance - edge.source.radius - edge.target.radius);
    const middle = length / 2;
    offsets.set(edge.id, middle);
    if (edge.labelWidth === 0 || distance === 0) continue;

    const ux = dx / distance;
    const uy = dy / distance;
    const boxAt = (offset: number): Box => {
      const cx = edge.source.x + ux * (edge.source.radius + offset);
      const cy = edge.source.y + uy * (edge.source.radius + offset);
      return {
        x1: cx - edge.labelWidth / 2,
        y1: cy - edge.labelHeight / 2,
        x2: cx + edge.labelWidth / 2,
        y2: cy + edge.labelHeight / 2,
      };
    };
    const isFree = (offset: number) => placed.every((box) => !intersects(boxAt(offset), box, gap));

    // Середина, затем по шагу в обе стороны, не подходя к узлам ближе чем на шаг.
    let chosen = middle;
    if (!isFree(middle)) {
      const maxShift = middle - step;
      for (let shift = step; shift <= maxShift; shift += step) {
        if (isFree(middle + shift)) {
          chosen = middle + shift;
          break;
        }
        if (isFree(middle - shift)) {
          chosen = middle - shift;
          break;
        }
      }
    }
    offsets.set(edge.id, chosen);
    placed.push(boxAt(chosen));
  }

  return offsets;
}
