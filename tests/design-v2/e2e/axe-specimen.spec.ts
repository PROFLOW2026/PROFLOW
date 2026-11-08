/**
 * EXLFY Design V2 gate 10 — axe WCAG on the static design-system specimen.
 * Combos: classic | modern | premium × light | dark (pf-ui-style / pf-ui-theme cookies).
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const SPECIMEN_ROUTE = "/he-IL/dev/design-system";
const STYLE_COOKIE = "pf-ui-style";
const THEME_COOKIE = "pf-ui-theme";
const STYLES = ["classic", "modern", "premium"] as const;
const THEMES = ["light", "dark"] as const;
type Style = (typeof STYLES)[number];
type Theme = (typeof THEMES)[number];

const EVIDENCE_PATH = path.join(
  process.cwd(),
  "docs",
  "design",
  "exlfy-design-v2",
  "evidence",
  "axe-specimen.json",
);

type AxeCounts = {
  violations: number;
  seriousOrCritical: number;
  byImpact: Record<string, number>;
};

type EvidenceRow = {
  style: Style;
  theme: Theme;
  tags: string[];
  counts: AxeCounts;
  seriousOrCriticalIds: string[];
};

type EvidenceFile = {
  generatedAt: string;
  route: string;
  baseURL: string;
  pfDesignSpecimen: boolean;
  axeTags: string[];
  combinations: EvidenceRow[];
};

function mergeEvidenceRow(row: EvidenceRow) {
  try {
    const dir = path.dirname(EVIDENCE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    let existing: EvidenceFile | null = null;
    if (fs.existsSync(EVIDENCE_PATH)) {
      try {
        existing = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8")) as EvidenceFile;
      } catch {
        existing = null;
      }
    }
    const combinations = [...(existing?.combinations ?? [])];
    const key = `${row.style}:${row.theme}`;
    const index = combinations.findIndex((c) => `${c.style}:${c.theme}` === key);
    if (index >= 0) {
      combinations[index] = row;
    } else {
      combinations.push(row);
    }
    combinations.sort((a, b) => a.style.localeCompare(b.style) || a.theme.localeCompare(b.theme));
    const payload: EvidenceFile = {
      generatedAt: new Date().toISOString(),
      route: SPECIMEN_ROUTE,
      baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3010",
      pfDesignSpecimen: process.env.PF_DESIGN_SPECIMEN === "1",
      axeTags: ["wcag2a", "wcag2aa"],
      combinations,
    };
    fs.writeFileSync(EVIDENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  } catch {
    /* evidence optional */
  }
}

async function setCookie(
  context: BrowserContext,
  baseURL: string | undefined,
  name: string,
  value: string,
) {
  const origin = baseURL ?? "http://127.0.0.1:3010";
  const { hostname, protocol } = new URL(origin);
  await context.addCookies([
    {
      name,
      value,
      domain: hostname,
      path: "/",
      secure: protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

async function openSpecimen(page: Page) {
  const response = await page.goto(SPECIMEN_ROUTE, { waitUntil: "domcontentloaded" });
  expect(response, "design-system specimen should respond").not.toBeNull();
  expect(response!.status()).toBe(200);
  await page.reload({ waitUntil: "networkidle" });
}

function countByImpact(violations: { impact?: string | null }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    const key = v.impact ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function seriousOrCritical(violations: { impact?: string | null; id: string }[]) {
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

function formatBlocking(violations: { id: string; impact?: string | null; description: string }[]) {
  return violations
    .map((v) => `[${v.impact ?? "?"}] ${v.id}: ${v.description}`)
  .join("\n");
}

test.describe("EXLFY Design V2 — axe specimen (wcag2a/aa)", () => {
  for (const style of STYLES) {
    for (const theme of THEMES) {
      test(`axe: pf-ui-style=${style}, pf-ui-theme=${theme}`, async ({ page, context, baseURL }) => {
        await setCookie(context, baseURL, STYLE_COOKIE, style);
        await setCookie(context, baseURL, THEME_COOKIE, theme);
        await openSpecimen(page);

        await expect(page.locator("html")).toHaveAttribute("data-pf-style", style);
        if (theme === "dark") {
          await expect(page.locator("html")).toHaveClass(/dark/);
        } else {
          await expect(page.locator("html")).not.toHaveClass(/dark/);
        }

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();

        const blocking = seriousOrCritical(results.violations);
        const evidenceRow: EvidenceRow = {
          style,
          theme,
          tags: ["wcag2a", "wcag2aa"],
          counts: {
            violations: results.violations.length,
            seriousOrCritical: blocking.length,
            byImpact: countByImpact(results.violations),
          },
          seriousOrCriticalIds: blocking.map((v) => v.id),
        };
        mergeEvidenceRow(evidenceRow);

        expect(
          blocking,
          `serious/critical WCAG violations (style=${style}, theme=${theme}):\n${formatBlocking(blocking)}`,
        ).toEqual([]);
      });
    }
  }
});