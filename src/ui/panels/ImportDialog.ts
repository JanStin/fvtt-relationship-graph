/**
 * Не отдельное ApplicationV2-окно, а лёгкий контрол (кнопка + скрытый file input),
 * который GraphApp вставляет в свой тулбар. Полноценный диалог с превью/выбором —
 * можно добавить позже, если понадобится; сейчас достаточно "выбрал файл — импортировалось".
 */

import { parseFangJson } from "../../import/fang";
import type { GraphData } from "../../core/model";

declare const ui: any;

export interface ImportControlCallbacks {
  onImported(data: GraphData, warnings: string[]): void;
}

export function createImportControl(callbacks: ImportControlCallbacks): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "flex:0 0 auto;display:flex;gap:8px;align-items:center;padding:6px 10px;background:#0f172a;";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Импорт FANG JSON";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.style.display = "none";

  button.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = ""; // разрешить повторный выбор того же файла подряд
    if (!file) return;

    void handleFile(file, callbacks);
  });

  wrapper.append(button, input);
  return wrapper;
}

async function handleFile(file: File, callbacks: ImportControlCallbacks): Promise<void> {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const { data, warnings } = parseFangJson(raw);

    callbacks.onImported(data, warnings);

    const summary = `Импортировано: ${data.nodes.length} узлов, ${data.edges.length} связей, ${data.factions.length} фракций`;
    if (warnings.length > 0) {
      ui.notifications?.warn(`${summary}. Предупреждений: ${warnings.length} (см. консоль).`);
      console.warn("fvtt-relationship-graph | import warnings", warnings);
    } else {
      ui.notifications?.info(summary);
    }
  } catch (err) {
    console.error("fvtt-relationship-graph | import failed", err);
    ui.notifications?.error("Импорт не удался — см. консоль");
  }
}
