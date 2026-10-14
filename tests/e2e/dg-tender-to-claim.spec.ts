import { test } from '@playwright/test';

/**
 * K04 / D04-007 — tender → portal bid → award → activate → claim (EB-8 seeded harness).
 * Registered in docs/ops/E2E-SKIP-REGISTRY.md until local seed + auth fixtures exist.
 */
test.describe.skip('DG tender to claim (EB-8)', () => {
  test('package → bid → award → activate → bill', async () => {
    // Implemented when EB-8 Playwright seed is available.
  });
});
