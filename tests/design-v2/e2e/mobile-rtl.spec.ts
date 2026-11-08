import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const SPECIMEN_ROUTE = "/he-IL/dev/design-system";
const STYLE_COOKIE = "pf-ui-style";
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const V2_STYLES = ["modern", "premium"] as const;

const specimenHarness = process.env.PF_DESIGN_SPECIMEN === "1";
const describeSpecimen = specimenHarness ? test.describe : test.describe.skip;

describeSpecimen("EXLFY Design V2 — mobile RTL specimen", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  async function setStyleCookie(context: BrowserContext, baseURL: string | undefined, style: (typeof V2_STYLES)[number]) {
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
    ]);
  }

  async function openSpecimen(page: Page) {
    const response = await page.goto(SPECIMEN_ROUTE, { waitUntil: "domcontentloaded" });
    expect(response, "design-system specimen should respond").not.toBeNull();
    expect(response!.status(), "design-system specimen should be reachable without auth").toBe(200);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  }

  async function assertStyleOnRoot(page: Page, style: (typeof V2_STYLES)[number]) {
    await expect(page.locator("html")).toHaveAttribute("data-pf-style", style);
    const attr = await page.evaluate(() => document.documentElement.getAttribute("data-pf-style"));
    expect(attr).toBe(style);
  }

  async function assertNoHorizontalOverflow(page: Page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `horizontal overflow at ${MOBILE_VIEWPORT.width}px (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`,
    ).toBeLessThanOrEqual(clientWidth + 1);
  }

  for (const style of V2_STYLES) {
    test(`pf-ui-style=${style}: data-pf-style + no horizontal overflow @ mobile`, async ({ page, context, baseURL }) => {
      await setStyleCookie(context, baseURL, style);
      await openSpecimen(page);
      await assertStyleOnRoot(page, style);
      await assertNoHorizontalOverflow(page);
    });
  }
});