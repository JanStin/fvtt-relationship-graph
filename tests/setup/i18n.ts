/**
 * Переводчик для тестов: строки из lang/ru.json с подстановкой {плейсхолдеров}, как
 * game.i18n.format. Поэтому тесты проверяют настоящие русские тексты, а не ключи.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTranslator } from "../../src/core/i18n";

type LangTree = { [key: string]: string | LangTree };

const ru = JSON.parse(readFileSync(resolve(__dirname, "../../lang/ru.json"), "utf8")) as LangTree;

function lookup(key: string): string | undefined {
  let node: string | LangTree | undefined = ru;
  for (const part of key.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** Ставит переводчик по lang/ru.json — при загрузке и для восстановления после тестов, подменивших его. */
export function installRuTranslator(): void {
  setTranslator((key, data) => {
    const text = lookup(key);
    if (text === undefined) return key;
    return data ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in data ? String(data[name]) : m)) : text;
  }, "ru");
}

installRuTranslator();
