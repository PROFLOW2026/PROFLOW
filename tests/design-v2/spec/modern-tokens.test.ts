import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const MODERN_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/modern.css");
const MODERN_HOOKS_CSS = path.join(REPO_ROOT, "src/shared/theme/styles/modern-hooks.css");

const LOCKED_LIGHT_ACTION: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-action-primary", hex: "#0a6b63" },
  { variable: "--pf-action-primary-hover", hex: "#085a53" },
  { variable: "--pf-action-primary-active", hex: "#06463f" },
  { variable: "--pf-action-primary-fg", hex: "#ffffff" },
];

const LOCKED_DARK_ACTION: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-action-primary", hex: "#2bb3a3" },
  { variable: "--pf-action-primary-hover", hex: "#3fc3b3" },
  { variable: "--pf-action-primary-active", hex: "#58d0c1" },
  { variable: "--pf-action-primary-fg", hex: "#04201d" },
];

const LOCKED_DARK_SURFACES: Array<{ variable: string; hex: string }> = [
  { variable: "--pf-bg-page", hex: "#0e1318" },
  { variable: "--pf-bg-surface", hex: "#161d25" },
  { variable: "--pf-bg-muted", hex: "#1b232c" },
  { variable: "--pf-border-default", hex: "#2a3541" },
];

function tokenHexPattern(variable: string, hex: string): RegExp {
  return new RegExp(`${variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*${hex}\\b`, "i");
}

function readPair(): { tokens: string; hooks: string; combined: string } {
  const tokens = fs.readFileSync(MODERN_CSS, "utf8");
  const hooks = fs.readFileSync(MODERN_HOOKS_CSS, "utf8");
  return { tokens, hooks, combined: `${tokens}\n${hooks}` };
}

describe("EXLFY Modern V3 locked tokens", () => {
  const { tokens, hooks, combined } = readPair();

  it("loads modern.css and modern-hooks.css from the theme styles directory", () => {
    expect(tokens.length).toBeGreaterThan(0);
    expect(hooks.length).toBeGreaterThan(0);
  });

  it.each(LOCKED_LIGHT_ACTION)("light $variable is $hex", ({ variable, hex }) => {
    expect(tokens).toMatch(tokenHexPattern(variable, hex));
  });

  it.each(LOCKED_DARK_ACTION)("dark $variable is $hex", ({ variable, hex }) => {
    expect(tokens).toMatch(tokenHexPattern(variable, hex));
  });

  it.each(LOCKED_DARK_SURFACES)("dark $variable is $hex", ({ variable, hex }) => {
    expect(tokens).toMatch(tokenHexPattern(variable, hex));
  });

  it("scopes hook rules with classic island guards", () => {
    expect(hooks).toContain(":not([data-pf-style='classic'] *)");
    const withoutClassicGuard = hooks.split("\n").filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes("data-pf-slot=")) return false;
      if (trimmed.startsWith("/*")) return false;
      return !trimmed.includes(":not([data-pf-style='classic'] *)");
    });
    expect(withoutClassicGuard, withoutClassicGuard.join("\n")).toEqual([]);
  });

  it("defines sidebar, tab, and bottom-nav slot hooks", () => {
    expect(combined).toContain("data-pf-slot='sidebar-item'");
    expect(combined).toContain("data-pf-slot='tab'");
    expect(combined).toContain("data-pf-slot='bottom-nav-item'");
  });

  it("active sidebar nav uses teal bar, accent tint, and ~0.375rem radius (not a pill)", () => {
    expect(hooks).toMatch(/data-pf-slot='sidebar-item'[\s\S]*border-inline-start:\s*3px solid var\(--pf-teal-700\)/);
    expect(hooks).toMatch(/data-pf-slot='sidebar-item'[\s\S]*background:\s*var\(--pf-accent-soft\)/);
    expect(hooks).toMatch(/data-pf-slot='sidebar-item'[\s\S]*border-radius:\s*0\.375rem/);
  });

  it("selected tabs and aria-pressed chips use tint, brand text, and 2px action underline", () => {
    expect(hooks).toMatch(
      /data-pf-slot='tab'[\s\S]*background:\s*var\(--pf-accent-soft\)[\s\S]*color:\s*var\(--pf-text-brand\)[\s\S]*border-bottom:\s*2px solid var\(--pf-action-primary\)/,
    );
    expect(hooks).toMatch(/data-pf-slot='tab'\]\[aria-pressed='true'\]/);
    expect(hooks).toMatch(
      /aria-pressed='true'[\s\S]*border-bottom:\s*2px solid var\(--pf-action-primary\)/,
    );
  });

  it("mobile bottom nav uses inset top bar via action primary (no pill)", () => {
    expect(hooks).toMatch(
      /data-pf-slot='bottom-nav-item'[\s\S]*box-shadow:\s*inset 0 2px 0 var\(--pf-action-primary\)/,
    );
  });
});
