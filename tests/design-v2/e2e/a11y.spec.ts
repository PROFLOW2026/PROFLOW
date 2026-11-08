import { test } from "@playwright/test";

/**
 * Full route a11y gates need the isolated PGlite harness (Q3).
 * Locked WCAG contrast ratios are covered in tests/unit/design-v2/contrast.test.ts.
 */
test.describe.skip("design-v2 a11y specimen", () => {
  test("placeholder — enable when PF_DESIGN_SPECIMEN harness is wired", () => {});
});