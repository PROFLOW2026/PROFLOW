import { test } from "@playwright/test";

/**
 * EXLFY Design V2 — cross-app style persistence (main, employee, contractor).
 * Harness needs PF_DESIGN_SPECIMEN + isolated auth; enable when Q3 PGlite wiring lands.
 *
 * Intended flow:
 * 1. Choose Modern or Premium in appearance settings on each surface.
 * 2. Hard refresh — data-pf-style and pf-ui-style cookie stay aligned.
 * 3. Sign out — style cookie resets to classic; next sign-in respects account metadata again.
 */
test.describe.skip("design-v2 style persistence (three-app)", () => {
  test("choose style, refresh, sign-out returns classic", async () => {
    // Placeholder — run when Playwright specimen harness is available in CI.
  });
});