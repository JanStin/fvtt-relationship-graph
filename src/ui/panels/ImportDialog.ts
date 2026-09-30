/**
 * Не отдельное ApplicationV2-окно, а лёгкий контрол (кнопки импорта/экспорта + скрытый file
 * input), который GraphApp вставляет в свой тулбар (только у GM). Кнопки компактные — иконки
 * с подсказкой. Полноценный диалог с превью/выбором — можно добавить позже, если
 * понадобится; сейчас достаточно "выбрал файл — импортировалось".
 */

import { parseGraphFile } from "../../import/native";
import type { GraphData } from "../../core/model";
import { iconButton } from "./form";

declare const ui: any;

export interface ImportControlCallbacks {
  onImported(data: GraphData, warnings: string[]): void;
  /** Экспорт — доступен и в режиме просмотра. */
  onExport(): void;
}

export interface ImportControl {
  element: HTMLElement;
  /** Импорт — только в режиме редактирования. */
  setEnabled(enabled: boolean): void;
}

const IMPORT_TITLE = "Импорт графа (файл экспорта модуля или FANG JSON)";

export function createImportControl(callbacks: ImportControlCallbacks): ImportControl {
  const wrapper = document.createElement("span");
  wrapper.className = "frg-toolbar-group";

  const button = iconButton("fa-file-import", IMPORT_TITLE);
  const exportButton = iconButton("fa-file-export", "Экспорт графа в файл");
  exportButton.addEventListener("click", () => callbacks.onExport());

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

  wrapper.append(button, exportButton, input);
  return {
    element: wrapper,
    setEnabled(enabled) {
      button.disabled = !enabled;
      button.title = enabled ? IMPORT_TITLE : `${IMPORT_TITLE} — доступен в режиме редактирования`;
    },
  };
}

async function handleFile(file: File, callbacks: ImportControlCallbacks): Promise<void> {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const { data, warnings, format } = parseGraphFile(raw);

    callbacks.onImported(data, warnings);

    const source = format === "fang" ? "FANG" : "файл графа";
    const summary = `Импортировано (${source}): ${data.nodes.length} узлов, ${data.edges.length} связей, ${data.factions.length} фракций`;
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
