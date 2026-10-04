// Извлечение строк интерфейса для локализации (задача L1).
// Находит в src/**/*.ts строковые и шаблонные литералы с кириллицей и выводит их, сгруппировав по
// тексту: одинаковые строки — одна запись со списком мест. Так Claude читает компактный список,
// а не исходники целиком.
//
//   node tools/i18n-extract.mjs              — JSON в stdout
//   node tools/i18n-extract.mjs --out f.json — JSON в файл
//   node tools/i18n-extract.mjs --check      — проверка (CI): код выхода 1, если строки остались
//                                              или lang/*.json расходятся с ru.json по ключам и плейсхолдерам
//
// Пропуск строки: комментарий `i18n-ignore` на той же или предыдущей строке.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectLiterals, CYRILLIC, listTs, parse, ROOT } from "./i18n-lib.mjs";

function extract() {
  const groups = new Map();
  for (const file of listTs()) {
    const code = readFileSync(file, "utf8");
    if (!CYRILLIC.test(code)) continue;
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    for (const lit of collectLiterals(parse(file, code), code)) {
      const group = groups.get(lit.text) ?? { text: lit.text, uses: [] };
      if (lit.args && Object.keys(lit.args).length) group.args = lit.args;
      if (lit.fn === null) group.top = true;
      group.uses.push(`${rel}:${lit.line} ${lit.fn ?? "<top>"} ${lit.site}`);
      groups.set(lit.text, group);
    }
  }
  return [...groups.values()];
}

const args = process.argv.slice(2);
const strings = extract();
const occurrences = strings.reduce((n, g) => n + g.uses.length, 0);

const PLURAL_FORMS = new Set(["zero", "one", "two", "few", "many", "other"]);

/**
 * Ключи файла перевода → набор плейсхолдеров. Формы числа (one/few/…) сворачиваются в ключ группы:
 * у языков разный набор категорий, важно лишь, что группа есть и в ней есть `other`.
 */
function langKeys(file) {
  const keys = new Map();
  (function walk(node, prefix) {
    for (const [name, value] of Object.entries(node)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (typeof value === "string") {
        keys.set(key, [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(","));
      } else if (Object.keys(value).every((k) => PLURAL_FORMS.has(k))) {
        keys.set(key, "other" in value ? "plural" : "plural без other");
      } else {
        walk(value, key);
      }
    }
  })(JSON.parse(readFileSync(join(ROOT, "lang", file), "utf8")), "");
  return keys;
}

/** Сверка lang/*.json с ru.json: те же ключи, те же плейсхолдеры. */
function checkLangFiles() {
  const problems = [];
  const ru = langKeys("ru.json");
  for (const file of readdirSync(join(ROOT, "lang")).filter((f) => f.endsWith(".json") && f !== "ru.json")) {
    const other = langKeys(file);
    for (const [key, placeholders] of ru) {
      if (!other.has(key)) problems.push(`${file}: нет ключа ${key}`);
      else if (other.get(key) !== placeholders) problems.push(`${file}: ${key} — {${other.get(key)}}, в ru.json {${placeholders}}`);
    }
    for (const key of other.keys()) if (!ru.has(key)) problems.push(`${file}: лишний ключ ${key}`);
  }
  for (const [key, value] of ru) if (value === "plural без other") problems.push(`ru.json: ${key} — нет формы other`);
  return problems;
}

if (args.includes("--check")) {
  let failed = false;
  if (strings.length) {
    for (const g of strings) for (const u of g.uses) console.error(`${u.split(" ")[0]}  ${JSON.stringify(g.text)}`);
    console.error(`\nНелокализованных строк: ${occurrences} (уникальных ${strings.length}).`);
    failed = true;
  }
  const problems = checkLangFiles();
  if (problems.length) {
    console.error(`\nРасхождения в переводах (${problems.length}):\n  ${problems.join("\n  ")}`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log("Нелокализованных строк нет, переводы совпадают с ru.json.");
  process.exit(0);
}

// Одна запись на строку — компактно для чтения и удобно для diff.
const json = `{"unique":${strings.length},"occurrences":${occurrences},"strings":[\n${strings.map((g) => JSON.stringify(g)).join(",\n")}\n]}`;
const outIndex = args.indexOf("--out");
if (outIndex >= 0) {
  writeFileSync(args[outIndex + 1], json + "\n");
  console.log(`${strings.length} уникальных строк, ${occurrences} мест → ${args[outIndex + 1]}`);
} else {
  console.log(json);
}
