/**
 * EXLFY Design V2 — style / theme switches on the static specimen.
 *
 * Limits (not run here):
 * - Real employee/contractor authenticated forms need the PGlite Playwright harness (builds the app).
 * - Three-app style persistence across sign-in/out is in persistence.spec.ts (skipped until Q3).
 *
 * Route: /he-IL/dev/design-system (requires PF_DESIGN_SPECIMEN=1 on the server).
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const SPECIMEN_ROUTE = "/he-IL/dev/design-system";
const STYLE_COOKIE = "pf-ui-style";
const THEME_COOKIE = "pf-ui-theme";
const STYLES = ["classic", "modern", "premium"] as const;
type Style = (typeof STYLES)[number];

const specimenHarness = process.env.PF_DESIGN_SPECIMEN === "1";
const describeSpecimen = specimenHarness ? test.describe : test.describe.skip;

describeSpecimen("EXLFY Design V2 — style switch specimen", () => {
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
  }

  async function reloadSpecimen(page: Page) {
    const response = await page.reload({ waitUntil: "domcontentloaded" });
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
  }

  async function assertStyleOnHtml(page: Page, style: Style) {
    await expect(page.locator("html")).toHaveAttribute("data-pf-style", style);
  }

  async function clientSwitchStyle(page: Page, next: Style) {
    await page.evaluate((style) => {
      const secure = window.location.protocol === "https:" ? "; secure" : "";
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `pf-ui-style=${style}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
      document.documentElement.dataset.pfStyle = style;
      try {
        const channel = new BroadcastChannel("pf-ui");
        channel.postMessage({ style });
        channel.close();
      } catch {
        /* BroadcastChannel unavailable */
      }
    }, next);
  }

  for (const style of STYLES) {
    test(`pf-ui-style=${style}: html[data-pf-style] after reload`, async ({ page, context, baseURL }) => {
      await setCookie(context, baseURL, STYLE_COOKIE, style);
      await openSpecimen(page);
      await reloadSpecimen(page);
      await assertStyleOnHtml(page, style);
      const cookieValue = await page.evaluate(() => {
        const match = document.cookie.match(/(?:^|; )pf-ui-style=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : "";
      });
      expect(cookieValue).toBe(style);
    });
  }

  test("client style switch keeps ephemeral input value (no reload)", async ({ page, context, baseURL }) => {
    await setCookie(context, baseURL, STYLE_COOKIE, "classic");
    await openSpecimen(page);
    await page.waitForLoadState("networkidle");
    await assertStyleOnHtml(page, "classic");

    // Specimen has no native text field; probe DOM only for in-place switch behavior.
    const probe = page.locator("#pf-specimen-probe");
    await page.evaluate(() => {
      const existing = document.getElementById("pf-specimen-probe");
      if (existing) return;
      const input = document.createElement("input");
      input.type = "text";
      input.id = "pf-specimen-probe";
      input.setAttribute("data-pf-specimen-probe", "1");
      input.setAttribute("aria-label", "style persistence probe");
      document.body.appendChild(input);
    });
    await expect(probe).toBeAttached();
    const typed = "שמירת טקסט בעת החלפת סגנון";
    await probe.fill(typed);
    await expect(probe).toHaveValue(typed);

    await clientSwitchStyle(page, "premium");
    await assertStyleOnHtml(page, "premium");
    await expect(probe).toHaveValue(typed);

    await clientSwitchStyle(page, "modern");
    await assertStyleOnHtml(page, "modern");
    await expect(probe).toHaveValue(typed);
  });

  test("pf-ui-theme=light|dark: resolved theme on html after reload (boot + server cookie path)", async ({
    page,
    context,
    baseURL,
  }) => {
    await setCookie(context, baseURL, THEME_COOKIE, "light");
    await openSpecimen(page);
    await reloadSpecimen(page);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-pf-resolved-theme", "light");

    await setCookie(context, baseURL, THEME_COOKIE, "dark");
    await reloadSpecimen(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-pf-resolved-theme", "dark");
  });

  test("pf-ui-theme=system: prefers-color-scheme flip updates html without reload", async ({
    page,
    context,
    baseURL,
  }) => {
    await setCookie(context, baseURL, THEME_COOKIE, "system");
    await openSpecimen(page);
    await reloadSpecimen(page);
    await expect(page.locator("html")).toHaveAttribute("data-pf-theme", "system");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          dark: document.documentElement.classList.contains("dark"),
          resolved: document.documentElement.getAttribute("data-pf-resolved-theme"),
        })),
      )
      .toEqual({ dark: true, resolved: "dark" });

    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(async () =>
        page.evaluate(() => ({
          dark: document.documentElement.classList.contains("dark"),
          resolved: document.documentElement.getAttribute("data-pf-resolved-theme"),
        })),
      )
      .toEqual({ dark: false, resolved: "light" });
  });

  test("client style switch must not remount the page (framenavigated gap detector)", async ({
    page,
    context,
    baseURL,
  }) => {
    await setCookie(context, baseURL, STYLE_COOKIE, "classic");
    await openSpecimen(page);

    let navigations = 0;
    const onNavigate = () => {
      navigations += 1;
    };
    page.on("framenavigated", onNavigate);

    try {
      await clientSwitchStyle(page, "modern");
      await assertStyleOnHtml(page, "modern");
      await clientSwitchStyle(page, "premium");
      await assertStyleOnHtml(page, "premium");

      expect(
        navigations,
        "in-place style switches should not trigger a full document navigation; a non-zero count is a product gap",
      ).toBe(0);
    } finally {
      page.off("framenavigated", onNavigate);
    }
  });
});