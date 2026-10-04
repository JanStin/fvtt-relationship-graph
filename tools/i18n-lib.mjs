// Общая часть скриптов локализации: поиск в исходниках строковых литералов с кириллицей.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

export { ts };
export const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
export const SRC = join(ROOT, "src");
export const CYRILLIC = /[А-Яа-яЁё]/;

export function listTs(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listTs(join(dir, e.name)) : e.name.endsWith(".ts") && !e.name.endsWith(".d.ts") ? [join(dir, e.name)] : [],
  );
}

export function parse(file, code) {
  return ts.createSourceFile(file, code, ts.ScriptTarget.ES2022, true);
}

/**
 * Дописывает `import { names } from "path";` в блок импортов — по алфавиту пути (как в проекте),
 * с тем же переводом строки, что в файле.
 */
export function insertImport(file, code, names, path) {
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const sf = parse(file, code);
  const imports = sf.statements.filter(ts.isImportDeclaration);
  const line = `import { ${names} } from "${path}";`;
  if (!imports.length) return `${line}${eol}${code}`;
  // Пакеты идут первыми, относительные пути — после них, внутри групп — по алфавиту.
  const rank = (spec) => `${spec.startsWith(".") ? 1 : 0}${spec}`;
  const before = imports.find((i) => rank(i.moduleSpecifier.text) > rank(path));
  if (before) {
    const at = before.getStart(sf);
    return `${code.slice(0, at)}${line}${eol}${code.slice(at)}`;
  }
  const at = imports[imports.length - 1].getEnd();
  return `${code.slice(0, at)}${eol}${line}${code.slice(at)}`;
}

/** Короткое имя для плейсхолдера: `node.name` → name, `items.length` → itemsLength, сложное — argN. */
function placeholderName(expr, index) {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) {
    const prop = expr.name.text;
    if (prop === "length" && ts.isIdentifier(expr.expression)) return `${expr.expression.text}Length`;
    return prop;
  }
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression) && ts.isIdentifier(expr.expression.expression)) {
    return expr.expression.expression.text; // count.toFixed(1) → count
  }
  return `arg${index}`;
}

/** Текст шаблона с {плейсхолдерами} — формат game.i18n.format; exprs — выражения по порядку. */
function templateText(node, sf) {
  let text = node.head.text;
  const args = {};
  const exprs = [];
  node.templateSpans.forEach((span, i) => {
    let name = placeholderName(span.expression, i);
    while (name in args && args[name] !== span.expression.getText(sf)) name += "_";
    args[name] = span.expression.getText(sf);
    exprs.push(span.expression.getText(sf));
    text += `{${name}}${span.literal.text}`;
  });
  return { text, args, exprs };
}

/** Где стоит литерал: ключ свойства, имя переменной, вызываемая функция. */
function describeSite(node, sf) {
  const p = node.parent;
  if (ts.isPropertyAssignment(p) && p.initializer === node) return `${p.name.getText(sf)}:`;
  if (ts.isVariableDeclaration(p)) return `const ${p.name.getText(sf)}`;
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const callee = p.expression.getText(sf).replace(/\s+/g, "");
    return `${callee.length > 40 ? "…" + callee.slice(-40) : callee}()`;
  }
  if (ts.isBinaryExpression(p) || ts.isConditionalExpression(p)) return "expr";
  if (ts.isReturnStatement(p)) return "return";
  if (ts.isArrayLiteralExpression(p)) return "array";
  return ts.SyntaxKind[p.kind];
}

/** Имя ближайшей функции/метода; null — литерал на верхнем уровне модуля (вычисляется до init). */
function enclosingFunction(node, sf) {
  for (let n = node.parent; n; n = n.parent) {
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isGetAccessor(n) || ts.isConstructorDeclaration(n)) {
      return n.name ? n.name.getText(sf) : "constructor";
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p = n.parent;
      if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) return p.name.getText(sf);
      if (!ts.isCallExpression(p)) return "<fn>";
      // колбэк (map/forEach/addEventListener) — ищем дальше, имя внешней функции полезнее
    }
  }
  return null;
}

function isIgnored(node, sf, lines) {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  return /i18n-ignore/.test(lines[line] ?? "") || /i18n-ignore/.test(lines[line - 1] ?? "");
}

function isSkippedContext(node, sf) {
  const p = node.parent;
  if (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  // Отладочный вывод не локализуем.
  if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText(sf))) return true;
  return false;
}

/**
 * Литералы с кириллицей в файле: { node, text, args?, exprs, line, fn, site }.
 * Вложенные литералы шаблона не возвращаются — они часть его аргументов.
 */
export function collectLiterals(sf, code) {
  const lines = code.split(/\r?\n/);
  const found = [];
  const visit = (node) => {
    let lit = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) lit = { text: node.text, exprs: [] };
    else if (ts.isTemplateExpression(node)) lit = templateText(node, sf);

    if (lit && CYRILLIC.test(lit.text) && !isSkippedContext(node, sf) && !isIgnored(node, sf, lines)) {
      found.push({
        ...lit,
        node,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        fn: enclosingFunction(node, sf),
        site: describeSite(node, sf),
      });
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}
