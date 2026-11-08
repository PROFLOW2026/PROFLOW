import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const SPECIMEN_ROUTE = "/he-IL/dev/design-system";
const STYLE_COOKIE = "pf-ui-style";
const THEME_COOKIE = "pf-ui-theme";
const MANIFEST_PATH = "/manifest.webmanifest";

const V2_STYLES = ["modern", "premium"] as const;
const DARK_SCREEN_PAGE: Record<(typeof V2_STYLES)[number], string> = {
  modern: "#0e1318",
  premium: "#0c1012",
};

const PREMIUM_MANIFEST_THEME_DARK = "#0c1012";
const MANIFEST_SPLASH_BG = "#0f766e";

async function seedCookies(
  context: BrowserContext,
  baseURL: string | undefined,
  style: (typeof V2_STYLES)[number],
) {
  const origin = baseURL ?? "http://127.0.0.1:3010";
  const { hostname, protocol } = new URL(origin);
  await context.addCookies([
    {
      name: STYLE_COOKIE,
      value: style,
      domain: hostname,
      path: "/",
      secure: protocol === "https:",
      sameSite: "Lax",
    },
    {
      name: THEME_COOKIE,
      value: "dark",
      domain: hostname,
      path: "/",
      secure: protocol === "https:",
      sameSite: "Lax",
    },
  ]);
}

async function readPageBgToken(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--pf-bg-page").trim(),
  );
}

async function attachToken(page: Page, style: string, phase: string, token: string) {
  await test.info().attach(`pf-bg-page:${style}:${phase}`, {
    body: token || "(empty)",
    contentType: "text/plain",
  });
}

test.describe("EXLFY Design V2 — print + PWA specimen", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3010";
    let response;
    try {
      response = await request.get(`${origin}${SPECIMEN_ROUTE}`, { timeout: 5_000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Specimen server connection failed at ${origin}: ${message}`);
    }
    expect(response.status(), "design-system specimen must be reachable").toBe(200);
  });

  for (const style of V2_STYLES) {
    test(`${style}: dark screen then print records --pf-bg-page without V2 dark canvas`, async ({
      page,
      context,
      baseURL,
    }) => {
      await seedCookies(context, baseURL, style);
      const response = await page.goto(SPECIMEN_ROUTE, { waitUntil: "domcontentloaded" });
      expect(response, "navigation should succeed").not.toBeNull();

      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.locator("html")).toHaveAttribute("data-pf-style", style);

      const screenBg = await readPageBgToken(page);
      await attachToken(page, style, "screen-dark", screenBg);
      expect(screenBg.toLowerCase()).toBe(DARK_SCREEN_PAGE[style]);

      await page.emulateMedia({ media: "print", colorScheme: "dark" });
      const printBg = await readPageBgToken(page);
      await attachToken(page, style, "print-dark", printBg);

      expect(
        printBg.toLowerCase(),
        `print --pf-bg-page must not keep ${style} dark screen canvas ${DARK_SCREEN_PAGE[style]}`,
      ).not.toBe(DARK_SCREEN_PAGE[style]);
    });
  }

  test("manifest.webmanifest reflects premium dark theme_color with splash background", async ({
    request,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://127.0.0.1:3010";
    const response = await request.get(`${origin}${MANIFEST_PATH}`, {
      headers: {
        Cookie: `${STYLE_COOKIE}=premium; ${THEME_COOKIE}=dark`,
      },
    });
    expect(response.status(), "manifest route should respond").toBe(200);
    const manifest = (await response.json()) as {
      theme_color?: string;
      background_color?: string;
    };
    expect(manifest.theme_color?.toLowerCase()).toBe(PREMIUM_MANIFEST_THEME_DARK);
    expect(manifest.background_color?.toLowerCase()).toBe(MANIFEST_SPLASH_BG);
  });
});