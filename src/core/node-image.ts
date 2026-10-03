/**
 * Картинка узла: откуда её брать у узла с актёром (портрет или токен) и как вписывать в круг
 * узла. Выравнивание — core/image-align.ts. Чистая логика — без DOM и Foundry.
 */

import type { ImageFit, ImageSource } from "./model";

export const IMAGE_SOURCES: readonly ImageSource[] = ["portrait", "token"];
export const IMAGE_FITS: readonly ImageFit[] = ["cover", "fill", "contain", "scale-down"];

/** У узла без поля (графы до 1.0.4) — портрет, как было раньше. */
export const DEFAULT_IMAGE_SOURCE: ImageSource = "portrait";
/** У узла без поля — cover, как было раньше. */
export const DEFAULT_IMAGE_FIT: ImageFit = "cover";

/** Неизвестное значение — портрет. */
export function normalizeImageSource(value: unknown): ImageSource {
  return IMAGE_SOURCES.includes(value as ImageSource) ? (value as ImageSource) : DEFAULT_IMAGE_SOURCE;
}

/** Неизвестное значение — cover. */
export function normalizeImageFit(value: unknown): ImageFit {
  return IMAGE_FITS.includes(value as ImageFit) ? (value as ImageFit) : DEFAULT_IMAGE_FIT;
}

/**
 * Картинка актёра для узла. Токен берётся, только если он задан и это один файл: шаблонный путь
 * (wildcard, со `*`) Foundry разрешает в случайный файл при каждом размещении — показываем портрет.
 * undefined — у актёра нет и портрета (узел оставит свою картинку).
 */
export function pickActorImage(
  source: ImageSource | undefined,
  portrait: string | undefined,
  token: string | undefined,
): string | undefined {
  if (normalizeImageSource(source) === "token" && token && !token.includes("*")) return token;
  return portrait;
}

export interface Size {
  width: number;
  height: number;
}

/** Как рисовать картинку в Cytoscape: background-fit и, для fill, растяжение на весь узел. */
export interface CytoscapeImageFit {
  fit: "cover" | "contain" | "none";
  /** true — background-width/height 100 %: картинка растягивается без сохранения пропорций. */
  stretch: boolean;
}

/**
 * Режим вписывания → стиль Cytoscape (как CSS object-fit):
 * - cover — заполняет узел, лишнее обрезается; contain — целиком внутри узла;
 * - fill — растягивается на весь узел без сохранения пропорций;
 * - scale-down — как contain, но не крупнее натурального размера: пока размер файла неизвестен
 *   (natural === null, картинка ещё грузится) — contain.
 * nodeSize — диаметр узла в единицах графа.
 */
export function cytoscapeImageFit(fit: ImageFit | undefined, nodeSize: number, natural: Size | null): CytoscapeImageFit {
  switch (normalizeImageFit(fit)) {
    case "fill":
      return { fit: "none", stretch: true };
    case "contain":
      return { fit: "contain", stretch: false };
    case "scale-down": {
      const fitsAsIs = natural !== null && natural.width > 0 && natural.width <= nodeSize && natural.height <= nodeSize;
      return { fit: fitsAsIs ? "none" : "contain", stretch: false };
    }
    default:
      return { fit: "cover", stretch: false };
  }
}
