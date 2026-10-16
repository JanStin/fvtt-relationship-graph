/**
 * Ссылки Foundry в тексте сведений: `@UUID[...]` и `@UUID[...]{подпись}`. Перед оформлением
 * ссылок (foundry/enrich.ts → TextEditor.enrichHTML) недоступные зрителю документы убираются из
 * текста: без подписи Foundry вывел бы название документа — игроку не положено его знать.
 * Чистая логика, без Foundry.
 */

const UUID_LINK = /@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g;

/**
 * Ссылки на документы, которые canSee не пропускает, заменяются обычным текстом: своей подписью
 * или hiddenLabel, если подписи нет. Остальной текст не меняется.
 */
export function restrictContentLinks(text: string, canSee: (uuid: string) => boolean, hiddenLabel: string): string {
  return text.replace(UUID_LINK, (link: string, uuid: string, label: string | undefined) => {
    if (canSee(uuid.trim())) return link;
    return label?.trim() ? label : hiddenLabel;
  });
}

/** Есть ли в тексте ссылки Foundry — без них оформлять нечего. */
export function hasContentLinks(text: string): boolean {
  return /@UUID\[[^\]]+\]/.test(text);
}

/**
 * Документ, перетащенный в поле из Foundry (боковая панель, лист, журнал), — ссылкой
 * `@UUID[...]`. raw — text/plain перетаскивания (JSON с uuid); не документ — null.
 */
export function contentLinkFromDrop(raw: string): string | null {
  try {
    const data: unknown = JSON.parse(raw);
    const uuid = data && typeof data === "object" ? (data as { uuid?: unknown }).uuid : undefined;
    return typeof uuid === "string" && uuid.trim() !== "" ? `@UUID[${uuid.trim()}]` : null;
  } catch {
    return null;
  }
}
