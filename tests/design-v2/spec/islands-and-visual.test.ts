import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const GLOBALS_CSS = path.join(REPO_ROOT, "src/app/globals.css");
const MODERN_HOOKS_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/modern-hooks.css");
const PREMIUM_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/premium.css");
const PREMIUM_HOOKS_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/premium-hooks.css");

const CLASSIC_GUARD = ":not([data-pf-style='classic'] *)";

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function sidebarItemActiveBlock(hooks: string): string {
  const match = hooks.match(
    /\[data-pf-style='modern'\] \[data-pf-slot='sidebar-item'\]\[aria-current='page'\]:not\(\[data-pf-style='classic'\] \*\)\s*\{([^}]+)\}/,
  );
  expect(match, "modern sidebar-item active rule").not.toBeNull();
  return match?.[1] ?? "";
}

function modernTabSelectedBlock(hooks: string): string {
  const match = hooks.match(
    /\[data-pf-style='modern'\] \[data-pf-slot='tab'\]\[aria-selected='true'\]:not\(\[data-pf-style='classic'\] \*\)[\s\S]*?\{([^}]+)\}/,
  );
  expect(match, "modern tab selected rule").not.toBeNull();
  return match?.[1] ?? "";
}

function premiumLightSidebarBlock(tokens: string): string {
  const match = tokens.match(
    /\[data-pf-style='premium'\] \[data-pf-slot='sidebar'\]\s*\{([^}]+)\}/,
  );
  expect(match, "premium light sidebar block").not.toBeNull();
  return match?.[1] ?? "";
}

function premiumDarkSidebarBlock(tokens: string): string {
  const match = tokens.match(
    /\.dark \[data-pf-style='premium'\] \[data-pf-slot='sidebar'\]\s*\{([^}]+)\}/,
  );
  expect(match, "premium dark sidebar block").not.toBeNull();
  return match?.[1] ?? "";
}

function hookSelectorsWithoutClassicGuard(hooksCss: string): string[] {
  const stripped = hooksCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const offenders: string[] = [];
  let depth = 0;
  let selectorStart = 0;
  let braceOpen = -1;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") {
      if (depth === 0) braceOpen = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && braceOpen !== -1) {
        const selector = stripped.slice(selectorStart, braceOpen).trim();
        if (!selector.startsWith("@") && selector.includes("data-pf-slot=") && !selector.includes(CLASSIC_GUARD)) {
          offenders.push(selector.replace(/\s+/g, " "));
        }
        selectorStart = i + 1;
        braceOpen = -1;
      }
    }
  }
  return offenders;
}

describe("EXLFY Design V2 islands and visual hooks", () => {
  const globals = readUtf8(GLOBALS_CSS);
  const modernHooks = readUtf8(MODERN_HOOKS_CSS);
  const premium = readUtf8(PREMIUM_CSS);
  const premiumHooks = readUtf8(PREMIUM_HOOKS_CSS);

  it("classic / FAB islands share globals :root token selectors with [data-pf-quick-create='fab']", () => {
    expect(globals).toMatch(
      /:root,\s*\n\s*\[data-pf-style='classic'],\s*\n\s*\[data-pf-quick-create='fab'\]\s*\{/,
    );
    expect(globals).toMatch(/\.dark \[data-pf-style='classic'],\s*\n\s*\.dark \[data-pf-quick-create='fab'\]/);
  });

  it("modern sidebar-item active uses a 3px teal bar (not a pill radius)", () => {
    const block = sidebarItemActiveBlock(modernHooks);
    expect(block).toMatch(/border-inline-start:\s*3px solid(?: var\(--pf-teal-700\)| #0a6b63)/);
    expect(block).toMatch(/var\(--pf-teal-700\)|#0a6b63/i);
    expect(block).not.toMatch(/border-radius:\s*999px/);
    expect(modernHooks).not.toMatch(
      /data-pf-slot='sidebar-item'[\s\S]*border-radius:\s*999px/,
    );
  });

  it("modern selected tab uses an underline (border-bottom or border-block-end), not a filled pill", () => {
    const block = modernTabSelectedBlock(modernHooks);
    const hasUnderline =
      /border-bottom:\s*\d+px/i.test(block) || /border-block-end:\s*\d+px/i.test(block);
    expect(hasUnderline, "expected border-bottom or border-block-end on selected tab").toBe(true);
    expect(block).not.toMatch(/border-radius:\s*999px/);
    expect(block).toMatch(/border-bottom:\s*2px solid var\(--pf-action-primary\)/);
  });

  it("premium KPI hooks use 1px card border and 0.75rem grid gap", () => {
    expect(premiumHooks).toMatch(
      /\[data-pf-slot='kpi-grid'\]:not\(\[data-pf-style='classic'\] \*\)[\s\S]*gap:\s*0\.75rem/,
    );
    expect(premiumHooks).toMatch(
      /\[data-pf-slot='kpi-card'\]:not\(\[data-pf-style='classic'\] \*\)[\s\S]*border:\s*1px solid/,
    );
  });

  it("premium light sidebar background is #ffffff with #172025 indicator accent", () => {
    const light = premiumLightSidebarBlock(premium);
    expect(light).toMatch(/--pf-bg-surface:\s*#ffffff\b/i);
    expect(light).toMatch(/--pf-accent:\s*#172025\b/i);
  });

  it("premium dark sidebar background is #090d0f", () => {
    const dark = premiumDarkSidebarBlock(premium);
    expect(dark).toMatch(/--pf-bg-surface:\s*#090d0f\b/i);
  });

  it("every slot hook selector includes the classic island guard", () => {
    expect(modernHooks).toContain(CLASSIC_GUARD);
    expect(premiumHooks).toContain(CLASSIC_GUARD);
    const modernOffenders = hookSelectorsWithoutClassicGuard(modernHooks);
    const premiumOffenders = hookSelectorsWithoutClassicGuard(premiumHooks);
    expect(
      modernOffenders,
      `modern-hooks missing guard:\n${modernOffenders.join("\n")}`,
    ).toEqual([]);
    expect(
      premiumOffenders,
      `premium-hooks missing guard:\n${premiumOffenders.join("\n")}`,
    ).toEqual([]);
  });
});