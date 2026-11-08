import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.test";

const STYLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../src/shared/theme/styles");
const THEMES = ["modern", "premium"] as const;
type PfTheme = (typeof THEMES)[number];
type PfMode = "light" | "dark";

const TEXT_MIN = 4.5;
const UI_MIN = 3;

function extractBalanced(css: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return css.slice(openBraceIndex + 1, i);
    }
  }
  throw new Error("unbalanced braces in theme CSS");
}

function sliceMainThemeBlock(css: string, style: PfTheme, mode: PfMode): string {
  if (mode === "light") {
    const re = new RegExp(String.raw`\[data-pf-style='${style}'\]\s*\{`);
    const match = re.exec(css);
    if (!match) throw new Error(`missing light block for ${style}`);
    const brace = css.indexOf("{", match.index);
    return extractBalanced(css, brace);
  }
  const re = new RegExp(
    String.raw`(?:\.dark\s+\[data-pf-style='${style}'\]|` +
      String.raw`\[data-pf-style='${style}'\]\.dark)\s*\{`,
  );
  const match = re.exec(css);
  if (!match) throw new Error(`missing dark block for ${style}`);
  const brace = css.indexOf("{", match.index);
  return extractBalanced(css, brace);
}

function parseLockedHexTokens(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  const re = /--(pf-[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g;
  for (let m = re.exec(block); m; m = re.exec(block)) {
    tokens[m[1]!] = m[2]!.toLowerCase();
  }
  return tokens;
}

function loadThemeTokens(style: PfTheme, mode: PfMode): Record<string, string> {
  const css = readFileSync(join(STYLES_DIR, `${style}.css`), "utf8");
  const block = sliceMainThemeBlock(css, style, mode);
  return parseLockedHexTokens(block);
}

type ContrastCase = {
  id: string;
  foregroundKey: string;
  backgroundKey: string;
  minRatio: number;
};

function casesForTheme(style: PfTheme, mode: PfMode, tokens: Record<string, string>): ContrastCase[] {
  const prefix = `${style}-${mode}`;
  const actionCases: ContrastCase[] = [
    {
      id: `${prefix}-action-primary`,
      foregroundKey: "pf-action-primary-fg",
      backgroundKey: "pf-action-primary",
      minRatio: TEXT_MIN,
    },
    {
      id: `${prefix}-action-primary-hover`,
      foregroundKey: "pf-action-primary-fg",
      backgroundKey: "pf-action-primary-hover",
      minRatio: TEXT_MIN,
    },
    {
      id: `${prefix}-action-primary-active`,
      foregroundKey: "pf-action-primary-fg",
      backgroundKey: "pf-action-primary-active",
      minRatio: TEXT_MIN,
    },
  ];

  const textCases: ContrastCase[] = [
    {
      id: `${prefix}-text-primary-on-page`,
      foregroundKey: "pf-text-primary",
      backgroundKey: "pf-bg-page",
      minRatio: TEXT_MIN,
    },
    {
      id: `${prefix}-text-primary-on-surface`,
      foregroundKey: "pf-text-primary",
      backgroundKey: "pf-bg-surface",
      minRatio: TEXT_MIN,
    },
    {
      id: `${prefix}-text-muted-on-surface`,
      foregroundKey: "pf-text-muted",
      backgroundKey: "pf-bg-surface",
      minRatio: TEXT_MIN,
    },
  ];

  return [...actionCases, ...textCases].filter((c) => tokens[c.foregroundKey] && tokens[c.backgroundKey]);
}

function ratioFor(tokens: Record<string, string>, fgKey: string, bgKey: string): number {
  return contrastRatio(tokens[fgKey]!, tokens[bgKey]!);
}

describe("EXLFY Design V2 contrast matrix (Modern + Premium)", () => {
  for (const style of THEMES) {
    for (const mode of ["light", "dark"] as const) {
      const tokens = loadThemeTokens(style, mode);
      const cases = casesForTheme(style, mode, tokens);

      describe(`${style} ${mode}`, () => {
        it.each(cases)("$id >= $minRatio:1", ({ foregroundKey, backgroundKey, minRatio }) => {
          const ratio = ratioFor(tokens, foregroundKey, backgroundKey);
          expect(ratio).toBeGreaterThanOrEqual(minRatio);
        });

        it("records focus ring token", () => {
          expect(tokens["pf-focus-ring"]).toBeDefined();
        });

        it("focus ring non-text contrast vs page and surface >= 3", () => {
          const ring = tokens["pf-focus-ring"];
          const page = tokens["pf-bg-page"];
          const surface = tokens["pf-bg-surface"];
          expect(ring).toBeDefined();
          expect(page).toBeDefined();
          expect(surface).toBeDefined();
          const vsPage = contrastRatio(ring!, page!);
          const vsSurface = contrastRatio(ring!, surface!);
          expect(Math.max(vsPage, vsSurface)).toBeGreaterThanOrEqual(UI_MIN);
        });
      });
    }
  }
});