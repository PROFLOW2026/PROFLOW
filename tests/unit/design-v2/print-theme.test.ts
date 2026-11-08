import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  pwaColorsForStyle,
  pwaManifestColors,
  type PwaThemeColors,
} from "@/shared/theme/pwa-theme-colors";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const STYLES_DIR = path.join(REPO_ROOT, "src/shared/theme/styles");

const PREMIUM_LIGHT_PAGE = "#eef0f1";
const PREMIUM_DARK_PAGE = "#0c1012";
const MODERN_DARK_SCREEN_PAGE = "#0e1318";

const MISSING_PRINT_RESET_SELECTOR =
  "@media print { html.dark [data-pf-style='modern'], html.dark [data-pf-style='premium'], [data-pf-style='modern'].dark, [data-pf-style='premium'].dark { --pf-bg-page: var(--pf-neutral-50); } }";

function readThemeStylesCss(): string {
  const names = fs.readdirSync(STYLES_DIR).filter((name) => name.endsWith(".css"));
  return names.map((name) => fs.readFileSync(path.join(STYLES_DIR, name), "utf8")).join("\n");
}

function normalizedHex(value: string): string {
  return value.trim().toLowerCase();
}

function extractPrintBlocks(css: string): string[] {
  const blocks: string[] = [];
  const re = /@media\s+print\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    const start = i;
    while (i < css.length && depth > 0) {
      const ch = css[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    blocks.push(css.slice(start, i - 1));
  }
  return blocks;
}

function printResetsV2DarkPageBackground(css: string): boolean {
  const printBlocks = extractPrintBlocks(css);
  if (printBlocks.length === 0) return false;

  const touchesModern = (block: string) =>
    /\[data-pf-style=['"]modern['"]\]/.test(block) || /html\.dark/.test(block);
  const touchesPremium = (block: string) =>
    /\[data-pf-style=['"]premium['"]\]/.test(block) || /html\.dark/.test(block);
  const resetsPageBg = (block: string) =>
    /--pf-bg-page\s*:\s*(?!#0e1318)(?!#0c1012)/i.test(block);

  return printBlocks.some(
    (block) => resetsPageBg(block) && touchesModern(block) && touchesPremium(block),
  );
}

describe("EXLFY Design V2 — PWA chrome + print theme guards", () => {
  const stylesCss = readThemeStylesCss();

  it("premium PWA chrome includes locked light #eef0f1 and dark #0c1012 via pwaColorsForStyle", () => {
    const light: PwaThemeColors = pwaColorsForStyle("premium", "light");
    const dark: PwaThemeColors = pwaColorsForStyle("premium", "dark");
    expect(normalizedHex(light.themeColor)).toBe(PREMIUM_LIGHT_PAGE);
    expect(normalizedHex(light.backgroundColor)).toBe(PREMIUM_LIGHT_PAGE);
    expect(normalizedHex(dark.themeColor)).toBe(PREMIUM_DARK_PAGE);
    expect(normalizedHex(dark.backgroundColor)).toBe(PREMIUM_DARK_PAGE);
  });

  it("pwaManifestColors keeps splash background while style drives theme_color", () => {
    const premiumDark = pwaManifestColors("dark", "premium");
    expect(normalizedHex(premiumDark.themeColor)).toBe(PREMIUM_DARK_PAGE);
    expect(normalizedHex(premiumDark.backgroundColor)).toBe("#0f766e");
  });

  it("modern/premium dark screen page tokens stay screen-scoped (not bare :root)", () => {
    expect(stylesCss).toMatch(new RegExp(`--pf-bg-page:\\s*${MODERN_DARK_SCREEN_PAGE}`, "i"));
    expect(stylesCss).toMatch(new RegExp(`--pf-bg-page:\\s*${PREMIUM_DARK_PAGE}`, "i"));
    expect(stylesCss).toMatch(/@media\s+screen\s+and\s*\(\s*forced-colors:\s*none\s*\)/);
  });

  it("globals print reset restores the classic light page under html.dark", () => {
    const globals = fs.readFileSync(path.join(REPO_ROOT, "src/app/globals.css"), "utf8");
    const ok = printResetsV2DarkPageBackground(globals);
    expect(
      ok,
      `Missing print reset in src/app/globals.css — expected something like:\n${MISSING_PRINT_RESET_SELECTOR}`,
    ).toBe(true);
  });
});