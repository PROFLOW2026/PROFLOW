import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const GLOBALS_CSS = path.join(REPO_ROOT, "src/app/globals.css");
const STYLES_DIR = path.join(REPO_ROOT, "src/shared/theme/styles");

const MODERN_CSS = path.join(STYLES_DIR, "modern.css");
const PREMIUM_CSS = path.join(STYLES_DIR, "premium.css");
const MODERN_HOOKS_CSS = path.join(STYLES_DIR, "modern-hooks.css");
const PREMIUM_HOOKS_CSS = path.join(STYLES_DIR, "premium-hooks.css");

const NEW_STYLE_CSS_FILES = [
  MODERN_CSS,
  PREMIUM_CSS,
  MODERN_HOOKS_CSS,
  PREMIUM_HOOKS_CSS,
  path.join(STYLES_DIR, "tokens-structure.css"),
];

const CLASSIC_DARK_NEUTRAL_EXCEPTION = new Set(["--pf-neutral-300"]);
const CLASSIC_GUARD = ":not([data-pf-style='classic'] *)";

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function normalizeSelector(selector: string): string {
  return selector
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readBlockBody(css: string, braceOpen: number): { body: string; end: number } | null {
  let depth = 0;
  for (let j = braceOpen; j < css.length; j++) {
    const ch = css[j];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return { body: css.slice(braceOpen + 1, j), end: j };
      }
    }
  }
  return null;
}

function extractRuleBlock(
  css: string,
  selectorTest: (selector: string) => boolean,
  start = 0,
): string | null {
  let i = start;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) return null;
    const selector = css.slice(i, open).trim();
    const block = readBlockBody(css, open);
    if (!block) return null;

    if (selector.startsWith("@")) {
      const nested = extractRuleBlock(block.body, selectorTest, 0);
      if (nested !== null) return nested;
      i = block.end + 1;
      continue;
    }

    if (selectorTest(selector)) {
      return block.body;
    }
    i = block.end + 1;
  }
  return null;
}

function stripComments(block: string): string {
  return block.replace(/\/\*[\s\S]*?\*\//g, "");
}

function customPropertiesInBlock(block: string): Set<string> {
  const props = new Set<string>();
  for (const line of stripComments(block).split("\n")) {
    const m = line.trim().match(/^(--[\w-]+)\s*:/);
    if (m?.[1]) props.add(m[1]);
  }
  return props;
}

function parseCustomPropertyDeclarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of stripComments(block).split("\n")) {
    const m = line.trim().match(/^(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (m?.[1] && m[2]) map.set(m[1], m[2]);
  }
  return map;
}

function isLiteralColor(value: string): boolean {
  const v = value.trim();
  if (v.startsWith("var(")) return false;
  if (/^#([0-9a-f]{3,8})\b/i.test(v)) return true;
  if (/^rgb/i.test(v)) return true;
  if (/^color-mix/i.test(v)) return true;
  return false;
}

function extractClassicDarkBlock(globals: string): string {
  const match = globals.match(
    /\.dark,\s*\n\s*\.dark \[data-pf-style='classic'],\s*\n\s*\.dark \[data-pf-quick-create='fab'\]\s*\{([\s\S]*?)\n\s*\}/,
  );
  expect(match, "classic .dark block in globals.css").not.toBeNull();
  return match?.[1] ?? "";
}

function missingLightInDark(lightBody: string, darkBody: string): string[] {
  const light = customPropertiesInBlock(lightBody);
  const dark = customPropertiesInBlock(darkBody);
  return [...light].filter((name) => !dark.has(name)).sort();
}

function hookSelectorsWithoutClassicGuard(hooksCss: string): string[] {
  const stripped = hooksCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const offenders: string[] = [];

  function walk(css: string, start = 0): void {
    let i = start;
    while (i < css.length) {
      const open = css.indexOf("{", i);
      if (open === -1) return;
      const selector = css.slice(i, open).trim();
      const block = readBlockBody(css, open);
      if (!block) return;

      if (selector.startsWith("@")) {
        walk(block.body, 0);
        i = block.end + 1;
        continue;
      }

      const normalized = normalizeSelector(selector);
      if (normalized.includes("data-pf-slot=") && !normalized.includes(CLASSIC_GUARD)) {
        offenders.push(normalized);
      }

      i = block.end + 1;
    }
  }

  walk(stripped, 0);
  return offenders;
}

const DARK_NEUTRAL_STATUS = new Set([
  "--pf-status-pending-bg",
  "--pf-status-neutral-bg",
  "--pf-status-disabled-bg",
  "--pf-status-neutral-border",
  "--pf-status-disabled-border",
]);

function statusHueRedeclarations(css: string): string[] {
  const names: string[] = [];
  for (const line of stripComments(css).split("\n")) {
    const m = line.trim().match(/^(--pf-status-[\w-]+)\s*:/);
    if (m?.[1] && !DARK_NEUTRAL_STATUS.has(m[1])) names.push(m[1]);
  }
  return names;
}

function classicDarkBrandNeutralLiterals(globals: string): string[] {
  const block = extractClassicDarkBlock(globals);
  const decls = parseCustomPropertyDeclarations(block);
  const names: string[] = [];
  for (const [name, value] of decls) {
    if (name.startsWith("--pf-status-")) continue;
    if (!/^--pf-(teal|neutral)-/.test(name)) continue;
    if (isLiteralColor(value)) names.push(name);
  }
  return names.sort();
}

function expectBlock(label: string, body: string | null): string {
  expect(body, `${label} block not found`).not.toBeNull();
  return body ?? "";
}

describe("EXLFY Design V2 token parity", () => {
  const globals = readUtf8(GLOBALS_CSS);
  const modern = readUtf8(MODERN_CSS);
  const premium = readUtf8(PREMIUM_CSS);
  const modernHooks = readUtf8(MODERN_HOOKS_CSS);
  const premiumHooks = readUtf8(PREMIUM_HOOKS_CSS);

  it("modern light root tokens are all redeclared in modern dark root", () => {
    const light = expectBlock(
      "modern light",
      extractRuleBlock(modern, (s) => normalizeSelector(s) === "[data-pf-style='modern']"),
    );
    const dark = expectBlock(
      "modern dark",
      extractRuleBlock(
        modern,
        (s) =>
          normalizeSelector(s) === ".dark [data-pf-style='modern'], [data-pf-style='modern'].dark",
      ),
    );
    const missing = missingLightInDark(light, dark);
    expect(missing, `modern dark missing:\n${missing.join("\n")}`).toEqual([]);
  });

  it("premium light root tokens are all redeclared in premium dark root", () => {
    const light = expectBlock(
      "premium light",
      extractRuleBlock(premium, (s) => normalizeSelector(s) === "[data-pf-style='premium']"),
    );
    const dark = expectBlock(
      "premium dark",
      extractRuleBlock(
        premium,
        (s) =>
          normalizeSelector(s) === ".dark [data-pf-style='premium'], [data-pf-style='premium'].dark",
      ),
    );
    const missing = missingLightInDark(light, dark);
    expect(missing, `premium dark root missing:\n${missing.join("\n")}`).toEqual([]);
  });

  it("premium light sidebar tokens are all redeclared in premium dark sidebar", () => {
    const light = expectBlock(
      "premium light sidebar",
      extractRuleBlock(
        premium,
        (s) =>
          normalizeSelector(s) === "[data-pf-style='premium'] [data-pf-slot='sidebar']",
      ),
    );
    const dark = expectBlock(
      "premium dark sidebar",
      extractRuleBlock(
        premium,
        (s) =>
          normalizeSelector(s) ===
          ".dark [data-pf-style='premium'] [data-pf-slot='sidebar']",
      ),
    );
    const missing = missingLightInDark(light, dark);
    expect(missing, `premium dark sidebar missing:\n${missing.join("\n")}`).toEqual([]);
  });

  it("classic dark brand/neutral literal colors appear in modern and premium dark roots", () => {
    const required = classicDarkBrandNeutralLiterals(globals).filter(
      (name) => !CLASSIC_DARK_NEUTRAL_EXCEPTION.has(name),
    );

    const modernDark = expectBlock(
      "modern dark",
      extractRuleBlock(
        modern,
        (s) =>
          normalizeSelector(s) === ".dark [data-pf-style='modern'], [data-pf-style='modern'].dark",
      ),
    );
    const premiumDark = expectBlock(
      "premium dark",
      extractRuleBlock(
        premium,
        (s) =>
          normalizeSelector(s) === ".dark [data-pf-style='premium'], [data-pf-style='premium'].dark",
      ),
    );

    const modernNames = customPropertiesInBlock(modernDark);
    const premiumNames = customPropertiesInBlock(premiumDark);

    const missingModern = required.filter((name) => !modernNames.has(name));
    const missingPremium = required.filter((name) => !premiumNames.has(name));

    expect(
      missingModern,
      `modern dark missing classic brand/neutral literals:\n${missingModern.join("\n")}`,
    ).toEqual([]);
    expect(
      missingPremium,
      `premium dark missing classic brand/neutral literals:\n${missingPremium.join("\n")}`,
    ).toEqual([]);
  });

  it("does not redeclare --pf-status-* hue tokens in modern.css or premium.css", () => {
    const modernStatus = statusHueRedeclarations(modern);
    const premiumStatus = statusHueRedeclarations(premium);
    expect(
      modernStatus,
      `modern.css redeclares status hue tokens:\n${modernStatus.join("\n")}`,
    ).toEqual([]);
    expect(
      premiumStatus,
      `premium.css redeclares status hue tokens:\n${premiumStatus.join("\n")}`,
    ).toEqual([]);
  });

  it("scopes every hook selector with the classic island guard", () => {
    const modernOffenders = hookSelectorsWithoutClassicGuard(modernHooks);
    const premiumOffenders = hookSelectorsWithoutClassicGuard(premiumHooks);
    expect(
      modernOffenders,
      `modern-hooks.css selectors missing ${CLASSIC_GUARD}:\n${modernOffenders.join("\n")}`,
    ).toEqual([]);
    expect(
      premiumOffenders,
      `premium-hooks.css selectors missing ${CLASSIC_GUARD}:\n${premiumOffenders.join("\n")}`,
    ).toEqual([]);
  });

  it("does not use letter-spacing in new style CSS files", () => {
    const offenders: string[] = [];
    for (const filePath of NEW_STYLE_CSS_FILES) {
      const source = readUtf8(filePath);
      if (/letter-spacing\s*:/i.test(source)) {
        offenders.push(path.relative(REPO_ROOT, filePath));
      }
    }
    expect(offenders, `letter-spacing found in:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("does not introduce decorative linear-gradient in modern.css or premium.css", () => {
    expect(modern, "modern.css contains linear-gradient").not.toMatch(/linear-gradient\s*\(/i);
    expect(premium, "premium.css contains linear-gradient").not.toMatch(/linear-gradient\s*\(/i);
  });
});