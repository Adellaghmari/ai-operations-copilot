/* global process, console, URL */
// Visible copy audit. Finds hyphens and dashes in JSX text and in string literals that can reach the screen.
// Technical identifiers are allowed: attributes such as className, data-testid, id, href, to, key, type,
// aria-controls, htmlFor, queryKey, import paths, and machine values.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const SKIP_ATTRS = new Set([
  "className", "data-testid", "id", "href", "to", "key", "type", "htmlFor", "role", "aria-controls",
  "aria-labelledby", "aria-describedby", "aria-current", "aria-live", "accept", "testId", "closeTestId",
  "titleTestId", "name", "value", "variant", "size", "tone", "kind", "path", "rel", "target", "inputMode",
]);
const DASH = /[\u2013\u2014]|[A-Za-z0-9)]\s-\s[A-Za-z0-9(]|[A-Za-z]-[A-Za-z]/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "test" || entry === "assets" ? [] : walk(full);
    return /\.(tsx?)$/.test(entry) && !/\.test\./.test(entry) ? [full] : [];
  });
}

function insideSkippedAttr(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current) && SKIP_ATTRS.has(current.name.getText())) return true;
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) return true;
    // Machine identifiers are marked up as code and may keep their hyphens.
    if (ts.isJsxElement(current) && current.openingElement.tagName.getText() === "code") return true;
    if (ts.isCallExpression(current) && /^(cn|clsx|twMerge|useId|createContext)$/.test(current.expression.getText())) return true;
    if (ts.isPropertyAssignment(current) && /^(key|queryKey|to|id|to|href|match|path|state|testId|field|name)$/.test(current.name.getText())) return true;
    if (ts.isElementAccessExpression(current) || ts.isTypeNode(current) || ts.isLiteralTypeNode(current)) return true;
    if (ts.isCaseClause(current) || ts.isBinaryExpression(current) && ["===", "!==", "=="].includes(current.operatorToken.getText())) return true;
  }
  return false;
}

const hits = [];
for (const file of walk(root)) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    let text = null;
    if (ts.isJsxText(node)) text = node.getText();
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) text = node.text;
    // String literals made only of lowercase technical tokens (CSS classes, ARIA names, API paths, headers).
    const technical =
      text !== null &&
      !ts.isJsxText(node) &&
      (text.startsWith("/") ||
        /^(Content-Type|\(prefers-reduced-motion: reduce\))$/.test(text) ||
        text.split(/\s+/).every((token) => /^[a-z0-9:/[\]._%()#=-]+$/.test(token) || token === ""));
    if (text && !technical && DASH.test(text) && !insideSkippedAttr(node)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      hits.push(`${relative(root, file)}:${line + 1}: ${text.trim().replace(/\s+/g, " ").slice(0, 120)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (hits.length === 0) console.log("Copy audit: no dashes or hyphenated words in visible copy.");
else {
  console.log(`Copy audit: ${hits.length} hit(s)`);
  for (const hit of hits) console.log(hit);
  process.exitCode = 1;
}
