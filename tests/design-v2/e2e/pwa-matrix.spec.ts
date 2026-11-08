/**
 * EXLFY Design V2 — PWA manifest theme_color matrix (style × theme cookies).
 * Route: GET /manifest.webmanifest (cookie-aware; see src/app/manifest.webmanifest/route.ts).
 */
import { test, expect } from "@playwright/test";

const MANIFEST_PATH = "/manifest.webmanifest";
const STYLE_COOKIE = "pf-ui-style";
const THEME_COOKIE = "pf-ui-theme";

const STYLES = ["classic", "modern", "premium"] as const;
const THEMES = ["light", "dark"] as const;

type Style = (typeof STYLES)[number];
type Theme = (typeof THEMES)[number];

/** Expected theme_color from shared/theme/pwa-theme-colors (manifest uses pwaManifestColors). */
const EXPECTED_THEME_COLOR: Record<Style, Record<Theme, string>> = {
  classic: { light: "#0f766e", dark: "#252d3d" },
  modern: { light: "#ffffff", dark: "#161d25" },
  premium: { light: "#eef0f1", dark: "#0c1012" },
};

const MANIFEST_SPLASH_BACKGROUND = "#0f766e";

type WebManifestBody = {
  theme_color?: string;
  background_color?: string;
};

test.describe("EXLFY Design V2 — PWA manifest style × theme matrix", () => {
  for (const style of STYLES) {
    for (const theme of THEMES) {
      test(`manifest cookies style=${style} theme=${theme}`, async ({ request, baseURL }) => {
        const origin = baseURL ?? "http://127.0.0.1:3010";
        const expectedTheme = EXPECTED_THEME_COLOR[style][theme].toLowerCase();

        const response = await request.get(`${origin}${MANIFEST_PATH}`, {
          headers: {
            Cookie: `${STYLE_COOKIE}=${style}; ${THEME_COOKIE}=${theme}`,
          },
        });

        expect(response.status(), "manifest route should respond").toBe(200);

        const raw = await response.text();
        let manifest: WebManifestBody;
        try {
          manifest = JSON.parse(raw) as WebManifestBody;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`manifest JSON parse failed for style=${style} theme=${theme}: ${message}`);
        }

        const actualTheme = manifest.theme_color?.toLowerCase() ?? "(missing)";
        const actualBackground = manifest.background_color?.toLowerCase() ?? "(missing)";

        await test.info().attach(`manifest:${style}:${theme}`, {
          body: JSON.stringify({ theme_color: actualTheme, background_color: actualBackground }, null, 2),
          contentType: "application/json",
        });

        expect(
          actualBackground,
          `background_color should stay classic splash ${MANIFEST_SPLASH_BACKGROUND}`,
        ).toBe(MANIFEST_SPLASH_BACKGROUND);

        if (actualTheme !== expectedTheme) {
          await test.info().attach(`manifest-ignored-style:${style}:${theme}`, {
            body: `expected theme_color=${expectedTheme}; actual theme_color=${actualTheme} (manifest may be ignoring pf-ui-style=${style})`,
            contentType: "text/plain",
          });
        }

        expect(
          actualTheme,
          `theme_color for style=${style} theme=${theme}; actual=${actualTheme}`,
        ).toBe(expectedTheme);
      });
    }
  }
});