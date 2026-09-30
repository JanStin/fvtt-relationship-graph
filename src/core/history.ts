/**
 * История изменений графа для отмены/повтора (tasks.md, B17): стек снимков GraphData.
 * Шаг — одно сохранение; снимок — состояние ДО него. Чистая логика, без DOM и Foundry.
 * Живёт в памяти на время сеанса редактирования (B15), в мире не хранится.
 */

import type { GraphData } from "./model";

export const HISTORY_LIMIT = 30;

export class GraphHistory {
  #past: GraphData[] = [];
  #future: GraphData[] = [];
  readonly #limit: number;

  constructor(limit = HISTORY_LIMIT) {
    this.#limit = limit;
  }

  /** Новое действие: before — граф до него. Ветка повтора обрезается, старейшие шаги сверх предела забываются. */
  record(before: GraphData): void {
    this.#past.push(before);
    if (this.#past.length > this.#limit) this.#past.splice(0, this.#past.length - this.#limit);
    this.#future = [];
  }

  /** Граф, к которому откатиться; current уходит в повтор. null — отменять нечего. */
  undo(current: GraphData): GraphData | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(current);
    return previous;
  }

  /** Граф, к которому вернуться; current уходит в отмену. null — повторять нечего. */
  redo(current: GraphData): GraphData | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  clear(): void {
    this.#past = [];
    this.#future = [];
  }
}
