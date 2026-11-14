/**
 * AUDIT-ONLY owner auth setup for BUG-02.
 *
 * When `.next` was baked with developer `.env.local` Supabase URL, browser
 * sign-in hits cloud Auth and rejects `owner@e2e.test`. This setup rewrites
 * those requests to the local harness auth stub (:55321) without changing product code.
 */
import { test as setup } from '@playwright/test';
import { OWNER } from '../../../../../tests/e2e/harness/config';
import { signInThroughForm } from '../../../../../tests/e2e/fixtures/sign-in';

const AUTH_STUB = 'http://127.0.0.1:55321';

setup('authenticate owner via auth-stub rewrite', async ({ page }) => {
  await page.route(/https?:\/\/[^/]*supabase\.co\/.*/i, async (route) => {
    const incoming = new URL(route.request().url());
    const rewritten = new URL(incoming.pathname + incoming.search, AUTH_STUB);
    try {
      const response = await route.fetch({
        url: rewritten.toString(),
        headers: {
          ...route.request().headers(),
          host: '127.0.0.1:55321',
        },
      });
      await route.fulfill({ response });
    } catch (error) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'bug02_auth_rewrite_failed',
          message: error instanceof Error ? error.message : String(error),
          rewritten: rewritten.toString(),
        }),
      });
    }
  });

  await signInThroughForm(page, OWNER.email);
  await page.context().storageState({ path: 'tests/e2e/.auth/owner.json' });
});
