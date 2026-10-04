/**
 * Не отдельное ApplicationV2-окно, а лёгкий контрол (кнопки импорта/экспорта + скрытый file
 * input), который GraphApp вставляет в свой тулбар (только у GM). Кнопки компактные — иконки
 * с подсказкой. Полноценный диалог с превью/выбором — можно добавить позже, если
 * понадобится; сейчас достаточно "выбрал файл — импортировалось".
 */

import { t, tn } from "../../core/i18n";
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

export function createImportControl(callbacks: ImportControlCallbacks): ImportControl {
  const wrapper = document.createElement("span");
  wrapper.className = "frg-toolbar-group";

  const importTitle = t("RELGRAPH.Import.Title");
  const button = iconButton("fa-file-import", importTitle);
  const exportButton = iconButton("fa-file-export", t("RELGRAPH.Import.Export"));
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
      button.title = enabled ? importTitle : t("RELGRAPH.Import.TitleDisabled", { title: importTitle });
    },
  };
}

async function handleFile(file: File, callbacks: ImportControlCallbacks): Promise<void> {
  try {
    const text = await file.text();
    const raw = JSON.parse(text);
    const { data, warnings, format } = parseGraphFile(raw);

    callbacks.onImported(data, warnings);

    const source = format === "fang" ? "FANG" : t("RELGRAPH.Import.SourceNative");
    const summary = t("RELGRAPH.Import.Done", {
      source,
      nodes: tn("RELGRAPH.Common.Nodes", data.nodes.length),
      edges: tn("RELGRAPH.Common.Edges", data.edges.length),
      factions: tn("RELGRAPH.Common.FactionsCount", data.factions.length),
    });
    if (warnings.length > 0) {
      ui.notifications?.warn(t("RELGRAPH.Import.DoneWithWarnings", { summary, count: warnings.length }));
      console.warn("fvtt-relationship-graph | import warnings", warnings);
    } else {
      ui.notifications?.info(summary);
    }
  } catch (err) {
    console.error("fvtt-relationship-graph | import failed", err);
    ui.notifications?.error(t("RELGRAPH.Import.Failed"));
  }
}
