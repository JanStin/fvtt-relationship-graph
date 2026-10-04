// Замена строк в коде на t("RELGRAPH.…") по lang/ru.json (задача L1).
// Литерал сопоставляется со значением перевода без учёта имён плейсхолдеров:
// `Связи (${connections.length})` ↔ "Связи ({count})" → t("RELGRAPH.Node.Connections", { count: connections.length }).
// Формы множественного числа (группы one/few/many/other) не сопоставляются — их правят вручную.
//
//   node tools/i18n-apply.mjs --dry — только отчёт
//   node tools/i18n-apply.mjs       — заменить и дописать import { t }
//
// Не заменяет и выводит для ручной правки: литералы верхнего уровня модуля (t() там вызвался бы
// до загрузки переводов), строки без перевода, неоднозначные совпадения.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { collectLiterals, CYRILLIC, insertImport, listTs, parse, ROOT, SRC } from "./i18n-lib.mjs";

const PLACEHOLDER = /\{(\w+)\}/g;
const normalize = (text) => text.replace(PLACEHOLDER, "{}");
const dry = process.argv.includes("--dry");

// Перевод: нормализованный текст → ключ (null — несколько ключей с таким текстом).
const ru = JSON.parse(readFileSync(join(ROOT, "lang/ru.json"), "utf8"));
const byText = new Map();
const valueByKey = new Map();
(function walk(node, prefix) {
  for (const [name, value] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${name}` : name;
    if (typeof value === "string") {
      valueByKey.set(key, value);
      const norm = normalize(value);
      byText.set(norm, byText.has(norm) ? null : key);
    } else if (!("other" in value)) {
      walk(value, key);
    }
  }
})(ru, "");

const I18N_MODULE = join(SRC, "core", "i18n");
const report = { replaced: 0, top: [], unmatched: [], ambiguous: [], mismatch: [] };

function importPath(file) {
  let path = relative(dirname(file), I18N_MODULE).replace(/\\/g, "/");
  if (!path.startsWith(".")) path = `./${path}`;
  return path;
}

/** Один проход по файлу; возвращает новый код или null, если заменять нечего. */
function applyOnce(file, code, rel, collectReport) {
  const sf = parse(file, code);
  const edits = [];
  for (const lit of collectLiterals(sf, code)) {
    const where = `${rel}:${lit.line} ${JSON.stringify(lit.text)}`;
    const key = byText.get(normalize(lit.text));
    if (key === undefined) { if (collectReport) report.unmatched.push(where); continue; }
    if (key === null) { if (collectReport) report.ambiguous.push(where); continue; }
    if (lit.fn === null) { if (collectReport) report.top.push(`${where} → ${key}`); continue; }

    const names = [...valueByKey.get(key).matchAll(PLACEHOLDER)].map((m) => m[1]);
    if (names.length !== lit.exprs.length) { if (collectReport) report.mismatch.push(`${where} → ${key}`); continue; }
    const data = names.length ? `, { ${names.map((n, i) => (n === lit.exprs[i] ? n : `${n}: ${lit.exprs[i]}`)).join(", ")} }` : "";
    edits.push({ start: lit.node.getStart(sf), end: lit.node.getEnd(), text: `t("${key}"${data})` });
  }
  if (!edits.length) return null;

  let next = code;
  for (const e of edits.sort((a, b) => b.start - a.start)) next = next.slice(0, e.start) + e.text + next.slice(e.end);
  report.replaced += edits.length;

  if (!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*"[^"]*\/i18n"/.test(next)) next = insertImport(file, next, "t", importPath(file));
  return next;
}

for (const file of listTs()) {
  if (file.startsWith(I18N_MODULE)) continue;
  let code = readFileSync(file, "utf8");
  if (!CYRILLIC.test(code)) continue;
  const rel = relative(ROOT, file).replace(/\\/g, "/");

  // Повторные проходы — для литералов внутри выражений шаблона: `…${a ? b : "текст"}`.
  let changed = false;
  for (let pass = 0; pass < 4; pass++) {
    const next = applyOnce(file, code, rel, false);
    if (next === null) break;
    code = next;
    changed = true;
  }
  applyOnce(file, code, rel, true); // отчёт по тому, что осталось
  if (changed && !dry) writeFileSync(file, code);
}

const section = (title, items) => items.length && console.log(`\n${title} (${items.length}):\n  ${items.join("\n  ")}`);
console.log(`${dry ? "[dry] " : ""}Заменено: ${report.replaced}`);
section("Верхний уровень модуля — переделать в функции вручную", report.top);
section("Нет перевода в lang/ru.json", report.unmatched);
section("Неоднозначно (одинаковый текст у нескольких ключей)", report.ambiguous);
section("Число плейсхолдеров не совпадает", report.mismatch);
