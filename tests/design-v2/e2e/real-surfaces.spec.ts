import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { E2E_GC_CONTRACTOR, OWNER, SEED_PASSWORD, WORKER } from "../../e2e/harness/config";
import { signInThroughForm } from "../../e2e/fixtures/sign-in";

const STYLES = ["classic", "modern", "premium"] as const;
const THEMES = ["light", "dark"] as const;
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

type Row = {
  app: string;
  screen: string;
  style: string;
  theme: string;
  viewport: string;
  status: number | null;
  finalUrl: string;
  dataStyle: string | null;
  dark: boolean;
  overflow: boolean;
  pass: boolean;
};

const rows: Row[] = [];

function writeSummary() {
  const summary = {
    tool: "real-surfaces",
    base: "http://127.0.0.1:3100",
    isolated: true,
    screens: [...new Set(rows.map((row) => row.app + " " + row.screen))].length,
    checks: rows.length,
    passed: rows.filter((row) => row.pass).length,
    failed: rows.filter((row) => !row.pass).length,
    rows,
  };
  fs.mkdirSync("docs/design/exlfy-design-v2/evidence", { recursive: true });
  fs.writeFileSync("docs/design/exlfy-design-v2/evidence/real-surfaces.json", JSON.stringify(summary, null, 2));
  return summary;
}

async function applyAppearance(page: Page, style: string, theme: string) {
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    { name: "pf-ui-style", value: style, url: origin },
    { name: "pf-ui-theme", value: theme, url: origin },
  ]);
}

async function measure(
  page: Page,
  app: string,
  screen: string,
  style: string,
  theme: string,
  viewport: string,
): Promise<Row> {
  const response = await page.goto(screen, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? null;
  const metrics = await page.evaluate(() => ({
    dataStyle: document.documentElement.getAttribute("data-pf-style"),
    dark: document.documentElement.classList.contains("dark"),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  const pass =
    status !== null &&
    status < 500 &&
    metrics.dataStyle === style &&
    metrics.dark === (theme === "dark") &&
    !metrics.overflow;
  return { app, screen, style, theme, viewport, status, finalUrl: page.url(), ...metrics, pass };
}

async function sweep(
  page: Page,
  app: string,
  screens: readonly string[],
) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const style of STYLES) {
      for (const theme of THEMES) {
        await applyAppearance(page, style, theme);
        for (const screen of screens) rows.push(await measure(page, app, screen, style, theme, viewport.name));
      }
    }
  }
}

test.describe("real isolated surfaces", () => {
  test.setTimeout(20 * 60 * 1000);

  test("main, employee, and contractor across style, theme, and viewport", async ({ page }) => {
    await signInThroughForm(page, OWNER.email);
    await sweep(page, "main", ["/he-IL", "/he-IL/projects"]);
    writeSummary();

    await page.context().clearCookies();
    await signInThroughForm(page, WORKER.email, { expectDashboard: false });
    await sweep(page, "employee", ["/he-IL/employee", "/he-IL/employee/tasks"]);
    writeSummary();

    await page.context().clearCookies();
    try {
      await page.goto("/he-IL/contractor/sign-in");
      await page.locator("#contractor-username").fill(E2E_GC_CONTRACTOR.username);
      await page.locator("#contractor-password").fill(SEED_PASSWORD);
      await page.getByRole("button", { name: "כניסה" }).click();
      await page.waitForURL(/\/contractor\/?$/, { timeout: 45_000 });
      await sweep(page, "contractor", ["/he-IL/contractor"]);
    } catch (error) {
      rows.push({
        app: "contractor",
        screen: "/he-IL/contractor/sign-in",
        style: "classic",
        theme: "light",
        viewport: "desktop",
        status: null,
        finalUrl: page.url(),
        dataStyle: null,
        dark: false,
        overflow: false,
        pass: false,
        error: error instanceof Error ? error.message : String(error),
      } as Row);
    }
    const summary = {
      tool: "real-surfaces",
      base: "http://127.0.0.1:3100",
      isolated: true,
      screens: [...new Set(rows.map((row) => `${row.app} ${row.screen}`))].length,
      checks: rows.length,
      passed: rows.filter((row) => row.pass).length,
      failed: rows.filter((row) => !row.pass).length,
      rows,
    };
    fs.mkdirSync("docs/design/exlfy-design-v2/evidence", { recursive: true });
    fs.writeFileSync("docs/design/exlfy-design-v2/evidence/real-surfaces.json", JSON.stringify(summary, null, 2));
    expect(summary.failed, JSON.stringify(rows.filter((row) => !row.pass), null, 2)).toBe(0);
  });
});
