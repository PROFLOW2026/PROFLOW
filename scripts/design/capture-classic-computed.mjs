import fs from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010";
const baseline = JSON.parse(fs.readFileSync("docs/design/exlfy-design-v2/evidence/baseline/classic-tokens.json", "utf8"));

function parseColor(value) {
  const text = String(value).trim().toLowerCase();
  const hex = text.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let raw = hex[1];
    if (raw.length === 3 || raw.length === 4) raw = raw.split("").map((c) => c + c).join("");
    const n = raw.slice(0, 6);
    const a = raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16), a];
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/);
  if (!rgb) return null;
  const parts = rgb[1].replace(/\//g, " ").split(/[,\s]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
function resolveDeclared(value, map, seen = new Set()) {
  let current = String(value).trim();
  for (let i = 0; i < 8; i += 1) {
    const match = current.match(/^var\(\s*(--pf-[a-z0-9-]+)\s*\)$/i);
    if (!match || seen.has(match[1]) || !map[match[1]]) return current;
    seen.add(match[1]);
    current = String(map[match[1]]).trim();
  }
  return current;
}
function colorsEqual(a, b) {
  if (!a || !b) return false;
  return a.every((n, i) => Math.abs(n - b[i]) <= (i === 3 ? 0.02 : 1));
}
function expand(value, map) {
  let current = String(value);
  for (let i = 0; i < 8; i += 1) {
    const next = current.replace(/var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([^)]+))?\)/g, (all, name, fallback) => map[name] ?? (fallback ? fallback.trim() : all));
    if (next === current) break;
    current = next;
  }
  return current.replace(/\s+/g, " ").trim();
}
function canon(value) {
  return String(value).toLowerCase().replace(/\s+/g, "").replace(/0+(\.[0-9]+)/g, "$1");
}
function timeEqual(a, b) {
  const parse = (value) => {
    const match = canon(value).match(/^([\d.]+)(ms|s)$/);
    if (!match) return null;
    return match[2] === "ms" ? Number(match[1]) : Number(match[1]) * 1000;
  };
  const left = parse(a);
  const right = parse(b);
  return left != null && right != null && Math.abs(left - right) < 0.2;
}
function same(expected, actual, map) {
  const left = expand(expected, map);
  const right = String(actual).trim();
  if (canon(left) === canon(right)) return true;
  if (timeEqual(left, right)) return true;
  if (colorsEqual(parseColor(left), parseColor(right))) return true;
  const env = left.match(/^env\([^,]+,\s*([^)]+)\)$/i);
  if (env && canon(env[1]) === canon(right)) return true;
  const paint = (value) => String(value)
    .replace(/env\([^,]+,\s*([^)]+)\)/gi, "$1")
    .replace(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g, (token) => {
      const color = parseColor(token);
      return color ? color.map((n, i) => (i === 3 ? n.toFixed(2) : Math.round(n))).join(",") : token;
    });
  return canon(paint(left)) === canon(paint(right));
}

const browser = await chromium.launch();
const report = { tool: "classic-computed", base, modes: {} };
let failed = 0;
for (const appearance of ["light", "dark"]) {
  const context = await browser.newContext({ colorScheme: appearance });
  await context.addCookies([
    { name: "pf-ui-style", value: "classic", url: base },
    { name: "pf-ui-theme", value: appearance, url: base },
  ]);
  const page = await context.newPage();
  const response = await page.goto(`${base}/he-IL/dev/design-system`, { waitUntil: "domcontentloaded" });
  const computed = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const values = {};
    for (const prop of style) if (prop.startsWith("--pf-")) values[prop] = style.getPropertyValue(prop).trim();
    return {
      values,
      style: document.documentElement.getAttribute("data-pf-style"),
      dark: document.documentElement.classList.contains("dark"),
    };
  });
  const expected = baseline[appearance];
  const mismatches = [];
  for (const [prop, value] of Object.entries(expected)) {
    const actual = computed.values[prop];
    if (!same(value, actual ?? "", expected)) mismatches.push({ prop, expected: value, actual: actual ?? null });
  }
  failed += mismatches.length;
  report.modes[appearance] = {
    status: response?.status() ?? null,
    dataStyle: computed.style,
    darkClass: computed.dark,
    compared: Object.keys(expected).length,
    mismatches: mismatches.slice(0, 30),
    mismatchCount: mismatches.length,
  };
  await context.close();
}
await browser.close();
const out = "docs/design/exlfy-design-v2/evidence/p3-classic-computed.json";
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failed, light: report.modes.light.mismatchCount, dark: report.modes.dark.mismatchCount, lightStyle: report.modes.light.dataStyle, darkClass: report.modes.dark.darkClass }));
process.exit(failed === 0 ? 0 : 1);