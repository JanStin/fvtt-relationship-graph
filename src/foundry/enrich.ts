/**
 * Оформление ссылок Foundry (`@UUID[...]`) в тексте сведений через TextEditor.enrichHTML и
 * проверка, виден ли документ по ссылке текущему пользователю. Какие ссылки убрать до
 * оформления — core/content-links.ts.
 */

declare const game: {
  user: { isGM: boolean } | null;
  packs: { get(id: string): { visible?: boolean } | undefined };
};
declare const foundry: any;
declare function fromUuidSync(uuid: string, options?: { strict?: boolean }): any;

/**
 * Документ по ссылке существует и виден пользователю: мир — хотя бы «Ограниченный» доступ,
 * компендиум — пакет виден. GM видит всё существующее.
 */
export function canViewUuid(uuid: string): boolean {
  let doc: any;
  try {
    doc = fromUuidSync(uuid, { strict: false });
  } catch {
    return false;
  }
  if (!doc) return false;
  const user = game.user;
  if (!user) return false;
  if (user.isGM) return true;
  // запись индекса компендиума — не документ: решает видимость пакета
  if (typeof doc.testUserPermission !== "function") return doc.pack ? game.packs.get(doc.pack)?.visible === true : false;
  return doc.testUserPermission(user, "LIMITED") === true;
}

/**
 * html — уже экранированный текст (абзацы <p>); оформляются только ссылки на документы и URL.
 * Броски, встраивание и секреты выключены: это сведения для чтения, а не журнал.
 */
export async function enrichContent(html: string): Promise<string> {
  const editor = foundry.applications.ux.TextEditor.implementation;
  return editor.enrichHTML(html, { documents: true, links: true, rolls: false, embeds: false, secrets: false });
}
