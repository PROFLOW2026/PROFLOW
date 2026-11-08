/**
 * EXLFY Design V2 — RTL/LTR locale specimen routes (gate-11).
 *
 * Route pattern: /{locale}/dev/design-system (PF_DESIGN_SPECIMEN=1 on the server).
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const STYLE_COOKIE = "pf-ui-style";
const PREMIUM_STYLE = "premium";
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

const LOCALE_CASES = [
  { locale: "he-IL", route: "/he-IL/dev/design-system", expectedDir: "rtl" },
  { locale: "ar", route: "/ar/dev/design-system", expectedDir: "rtl" },
  { locale: "en", route: "/en/dev/design-system", expectedDir: "ltr" },
  { locale: "ru", route: "/ru/dev/design-system", expectedDir: "ltr" },
] as const;

const specimenHarness = process.env.PF_DESIGN_SPECIMEN === "1";
const describeSpecimen = specimenHarness ? test.describe : test.describe.skip;

describeSpecimen("EXLFY Design V2 — RTL/LTR locales specimen (gate-11)", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  async function setPremiumStyleCookie(context: BrowserContext, baseURL: string | undefined) {
    const origin = baseURL ?? "http://127.0.0.1:3010";
    const { hostname, protocol } = new URL(origin);
    await context.addCookies([
      {
        name: STYLE_COOKIE,
        value: PREMIUM_STYLE,
        domain: hostname,
        path: "/",
        secure: protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  }

  async function openLocaleRoute(page: Page, route: string) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `design-system specimen should respond (${route})`).not.toBeNull();
    const status = response!.status();
    expect(
      status,
      `design-system specimen ${route} must be reachable (expected 200, got HTTP ${status})`,
    ).toBe(200);
    return response;
  }

  async function assertDocumentDir(page: Page, expectedDir: "rtl" | "ltr", locale: string) {
    await expect(page.locator("html"), `html[dir] for locale ${locale}`).toHaveAttribute("dir", expectedDir);
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

  async function assertLetterSpacingNormalOnly(page: Page, locale: string) {
    const offenders = await page.evaluate(() => {
      const allowed = new Set(["normal", "0px", "0"]);
      const out: Array<{ tag: string; id: string; className: string; letterSpacing: string }> = [];
      const walk = (root: ParentNode) => {
        const tree = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        let node = tree.currentNode as Element | null;
        while (node) {
          const el = node as HTMLElement;
          const spacing = window.getComputedStyle(el).letterSpacing;
          if (!allowed.has(spacing)) {
            out.push({
              tag: el.tagName.toLowerCase(),
              id: el.id,
              className: typeof el.className === "string" ? el.className : "",
              letterSpacing: spacing,
            });
          }
          node = tree.nextNode() as Element | null;
        }
      };
      walk(document.body);
      return out.slice(0, 25);
    });
    expect(
      offenders,
      `locale ${locale}: every specimen element must use letter-spacing normal or 0; offenders (up to 25): ${JSON.stringify(offenders)}`,
    ).toEqual([]);
  }

  for (const { locale, route, expectedDir } of LOCALE_CASES) {
    test(`locale ${locale}: dir=${expectedDir}, no overflow, letter-spacing @ mobile + premium`, async ({
      page,
      context,
      baseURL,
    }) => {
      await setPremiumStyleCookie(context, baseURL);
      await openLocaleRoute(page, route);
      await assertDocumentDir(page, expectedDir, locale);
      await assertNoHorizontalOverflow(page);
      await assertLetterSpacingNormalOnly(page, locale);
    });
  }
});