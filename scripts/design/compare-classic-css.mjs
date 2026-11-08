import fs from "node:fs";
import postcss from "postcss";

const baselinePath = process.argv[2];
const headPath = process.argv[3];
const outPath = process.argv[4];

function isStyleSkin(selector) {
  return /data-pf-style\s*=\s*['"](?:modern|premium)['"]/.test(selector);
}
function ancestorSkin(node) {
  let current = node.parent;
  while (current) {
    if (current.type === "rule" && isStyleSkin(current.selector || "")) return true;
    if (current.type === "atrule" && isStyleSkin(current.params || "")) return true;
    current = current.parent;
  }
  return false;
}
function collect(css) {
  const root = postcss.parse(css);
  const map = new Map();
  root.walkRules((rule) => {
    if (isStyleSkin(rule.selector) || ancestorSkin(rule)) return;
    const supports = rule.nodes?.find((node) => node.type === "atrule" && node.name === "supports");
    const source = supports?.nodes?.some((node) => node.type === "decl") ? supports.nodes : rule.nodes;
    const decls = source
      .filter((node) => node.type === "decl")
      .map((decl) => [decl.prop, decl.value.replace(/\s+/g, " ").trim()]);
    const key = normalizeSelector(rule.selector);
    const prev = map.get(key) ?? [];
    map.set(key, prev.concat(decls));
  });
  return map;
}
function normalizeSelector(selector) {
  const parts = selector.split(",").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
  const kept = parts.filter((part) => !/data-pf-style\s*=\s*['"]classic['"]/.test(part) && !/data-pf-quick-create\s*=\s*['"]fab['"]/.test(part));
  return [...new Set(kept.map((part) => part.replace(/\\\(--pf-lit-([a-z0-9-]+)\\\)/g, "$1")))].join(", ");
}
function num(value) {
  const match = String(value).trim().match(/^(-?\d*\.?\d+)([a-z%]*)$/i);
  if (!match) return null;
  return `${Number(match[1])}${match[2].toLowerCase()}`;
}
function resolve(value, tokens) {
  return value.replace(/var\(\s*(--(?:pf-lit-|color-|pf-radius-|radius-)[a-z0-9-]+)\s*\)/g, (_, name) => tokens.get(name) ?? `var(${name})`);
}
function sameValue(a, b, tokens) {
  const left = resolve(a, tokens);
  const right = resolve(b, tokens);
  if (left === right) return true;
  const ln = num(left);
  const rn = num(right);
  return ln != null && ln === rn;
}

const headCss = fs.readFileSync(headPath, "utf8");
const baseline = collect(fs.readFileSync(baselinePath, "utf8"));
const head = collect(headCss);
const tokens = new Map();
for (const [, decls] of baseline) {
  for (const [prop, value] of decls) if (prop.startsWith("--radius-") && !tokens.has(prop)) tokens.set(prop, value);
}
for (const cssPath of [baselinePath, headPath]) {
  const css = fs.readFileSync(cssPath, "utf8");
  for (const match of css.matchAll(/--(color-[a-z0-9-]+|pf-lit-[a-z0-9-]+|pf-radius-[a-z0-9-]+):\s*([^;]+);/g)) {
    const name = "--" + match[1]; if (!name.startsWith("--pf-radius-") || !tokens.has(name)) tokens.set(name, match[2].trim());
    if (match[1].startsWith("color-")) tokens.set("--pf-lit-" + match[1].slice("color-".length), match[2].trim());
    if (match[1].startsWith("pf-lit-")) tokens.set("--color-" + match[1].slice("pf-lit-".length), match[2].trim());
  }
}

const unexplained = [];
const allowed = { radius: 0, newClassicTokens: 0, islandSelector: 0, switchGuard: 0, litTokens: 0, litUtilities: 0 };
for (const [key, decls] of head) {
  const other = baseline.get(key);
  if (!other) {
    if (decls.every(([prop]) => prop.startsWith("--pf-lit-"))) {
      allowed.litTokens = (allowed.litTokens ?? 0) + decls.length;
      continue;
    }
    if (key.startsWith(".") && /(?:bg|text|border|from|via|to|ring)-(?:[a-z]+-\d+|black|white)/.test(key)) {
      allowed.litUtilities = (allowed.litUtilities ?? 0) + 1;
      continue;
    }
    if (key === "[data-pf-switching] *" && decls.every(([prop]) => prop.includes("transition"))) {
      allowed.switchGuard += 1;
      continue;
    }
    unexplained.push({ key, reason: "only-head", decls: decls.slice(0, 8) });
    continue;
  }
  const used = new Set();
  for (const [prop, value] of decls) {
    const match = other.find((item, index) => !used.has(index) && item[0] === prop && sameValue(value, item[1], tokens));
    if (match) {
      used.add(other.indexOf(match));
      if (value !== match[1]) allowed.radius += 1;
      continue;
    }
    const removedSameProp = other.find((item) => item[0] === prop);
    if (!removedSameProp && prop.startsWith("--pf-")) {
      allowed.newClassicTokens += 1;
      continue;
    }
    const resolvedHead = resolve(value, tokens);
    const opacityFallback = key.includes("\\/") && other.some((item) => item[0] === prop && item[1].includes("color-mix") && item[1].includes(resolvedHead));
    if (opacityFallback) {
      allowed.opacityFallback = (allowed.opacityFallback ?? 0) + 1;
      continue;
    }
    const equivalent = other.find((item) => item[0] === prop && sameValue(value, item[1], tokens));
    if (equivalent) {
      allowed.duplicateDecls = (allowed.duplicateDecls ?? 0) + 1;
      continue;
    }
    unexplained.push({ key, prop, head: value, base: removedSameProp?.[1] ?? null });
  }
}
for (const key of baseline.keys()) {
  if (!head.has(key)) unexplained.push({ key, reason: "only-base" });
}
if (baseline.has(".dark") && head.has(".dark")) allowed.islandSelector += 1;

const report = {
  tool: "compare-classic-css",
  pass: unexplained.length === 0,
  allowed,
  unexplained: unexplained.slice(0, 40),
  unexplainedCount: unexplained.length,
  radiusTokens: Object.fromEntries(tokens),
};
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ pass: report.pass, allowed, unexplainedCount: unexplained.length }));
process.exit(report.pass ? 0 : 1);