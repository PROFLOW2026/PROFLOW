import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const PREMIUM_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/premium.css");
const PREMIUM_HOOKS_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/premium-hooks.css");
const PREMIUM_FONT_TS = path.join(REPO_ROOT, "src/shared/theme/styles/premium-font.ts");

const LOCKED_LIGHT_ACTION: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-action-primary", hex: "#0b665f" },
  { variable: "--pf-action-primary-hover", hex: "#0b524c" },
  { variable: "--pf-action-primary-active", hex: "#0b433f" },
  { variable: "--pf-action-primary-fg", hex: "#ffffff" },
];

const LOCKED_DARK_ACTION: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-action-primary", hex: "#36b8a8" },
  { variable: "--pf-action-primary-hover", hex: "#4cd0c0" },
  { variable: "--pf-action-primary-active", hex: "#5fd3c4" },
  { variable: "--pf-action-primary-fg", hex: "#04201d" },
];

const LOCKED_LIGHT_RAIL: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-bg-surface", hex: "#ffffff" },
  { variable: "--pf-border-default", hex: "#d9dee0" },
  { variable: "--pf-text-primary", hex: "#11181b" },
  { variable: "--pf-text-muted", hex: "#566165" },
  { variable: "--pf-accent", hex: "#172025" },
];

const LOCKED_DARK_RAIL: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-bg-surface", hex: "#090d0f" },
  { variable: "--pf-border-default", hex: "#1b2327" },
  { variable: "--pf-text-primary", hex: "#ffffff" },
  { variable: "--pf-text-muted", hex: "#7f8b91" },
  { variable: "--pf-accent", hex: "#4cd0c0" },
];

function tokenHexPattern(variable: string, hex: string): RegExp {
  return new RegExp(`${variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*${hex}\\b`, "i");
}

function readPair(): { tokens: string; hooks: string; combined: string } {
  const tokens = fs.readFileSync(PREMIUM_CSS, "utf8");
  const hooks = fs.readFileSync(PREMIUM_HOOKS_CSS, "utf8");
  return { tokens, hooks, combined: `${tokens}\n${hooks}` };
}

function lightRailBlock(tokens: string): string {
  const match = tokens.match(
    /\[data-pf-style='premium'\] \[data-pf-slot='sidebar'\]\s*\{([^}]+)\}/,
  );
  expect(match, "light sidebar rail block").not.toBeNull();
  return match?.[1] ?? "";
}

function darkRailBlock(tokens: string): string {
  const match = tokens.match(
    /\.dark \[data-pf-style='premium'\] \[data-pf-slot='sidebar'\]\s*\{([^}]+)\}/,
  );
  expect(match, "dark sidebar rail block").not.toBeNull();
  return match?.[1] ?? "";
}

function lightRootAccentBlock(tokens: string): string {
  const match = tokens.match(/\[data-pf-style='premium'\]\s*\{([\s\S]*?)\n\s*\}/);
  expect(match, "light premium root block").not.toBeNull();
  return match?.[1] ?? "";
}

function darkRootAccentBlock(tokens: string): string {
  const match = tokens.match(
    /\.dark \[data-pf-style='premium'\],\s*\n\s*\[data-pf-style='premium'\]\.dark\s*\{([\s\S]*?)\n\s*\}/,
  );
  expect(match, "dark premium root block").not.toBeNull();
  return match?.[1] ?? "";
}

describe("EXLFY Premium V2 locked tokens", () => {
  const { tokens, hooks, combined } = readPair();

  it("loads premium.css and premium-hooks.css from the theme styles directory", () => {
    expect(tokens.length).toBeGreaterThan(0);
    expect(hooks.length).toBeGreaterThan(0);
  });

  it.each(LOCKED_LIGHT_ACTION)("light $variable is $hex", ({ variable, hex }) => {
    expect(tokens).toMatch(tokenHexPattern(variable, hex));
  });

  it.each(LOCKED_DARK_ACTION)("dark $variable is $hex", ({ variable, hex }) => {
    expect(tokens).toMatch(tokenHexPattern(variable, hex));
  });

  it("light global accent is #0f7469 in the premium root block", () => {
    expect(lightRootAccentBlock(tokens)).toMatch(tokenHexPattern("--pf-accent", "#0f7469"));
  });

  it("dark global accent is #4cd0c0 in the dark premium root block", () => {
    expect(darkRootAccentBlock(tokens)).toMatch(tokenHexPattern("--pf-accent", "#4cd0c0"));
  });

  it.each(LOCKED_LIGHT_RAIL)("light sidebar $variable is $hex", ({ variable, hex }) => {
    expect(lightRailBlock(tokens)).toMatch(tokenHexPattern(variable, hex));
  });

  it.each(LOCKED_DARK_RAIL)("dark sidebar $variable is $hex", ({ variable, hex }) => {
    expect(darkRailBlock(tokens)).toMatch(tokenHexPattern(variable, hex));
  });

  it("exports premiumFont from premium-font.ts", () => {
    const source = fs.readFileSync(PREMIUM_FONT_TS, "utf8");
    expect(source).toMatch(/export const premiumFont\b/);
  });

  it("scopes hook selectors with classic island guards", () => {
    expect(hooks).toContain(":not([data-pf-style='classic'] *)");
    const withoutClassicGuard = hooks.split("\n").filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes("data-pf-slot=")) return false;
      if (trimmed.startsWith("/*")) return false;
      if (trimmed.startsWith("@")) return false;
      return !trimmed.includes(":not([data-pf-style='classic'] *)");
    });
    expect(withoutClassicGuard, withoutClassicGuard.join("\n")).toEqual([]);
  });

  it("defines premium sidebar slot token overrides", () => {
    expect(tokens).toContain("[data-pf-slot='sidebar']");
  });

  it("KPI grid and cards use locked layout hooks", () => {
    expect(hooks).toMatch(
      /\[data-pf-slot='kpi-grid'\]:not\(\[data-pf-style='classic'\] \*\)[\s\S]*gap:\s*0\.75rem/,
    );
    expect(hooks).toMatch(
      /\[data-pf-slot='kpi-card'\]:not\(\[data-pf-style='classic'\] \*\)[\s\S]*border:\s*1px solid var\(--pf-border-default\)[\s\S]*border-radius:\s*var\(--pf-radius-lg\)/,
    );
  });

  it("defines sidebar-item, tab, and bottom-nav slot hooks", () => {
    expect(combined).toContain("data-pf-slot='sidebar-item'");
    expect(combined).toContain("data-pf-slot='tab'");
    expect(combined).toContain("data-pf-slot='bottom-nav'");
  });
});