import { expect, test } from '@playwright/test';
import {
  assertNoPageHorizontalOverflow,
  CRITICAL_OVERFLOW_WIDTHS,
  PAGE_OVERFLOW_WIDTHS,
  withViewport,
} from '../fixtures/layout';
import { he } from '../fixtures/locales';

/**
 * Page-level horizontal overflow on public critical routes.
 * Would fail on owner screenshots where the shell scrolled sideways on phones.
 */
test.describe('public page overflow', () => {
  test.describe.configure({ timeout: 180_000 });

  const publicRoutes = [
    { name: 'he-IL homepage', path: '/he-IL', heading: he.marketing.hero.title },
    { name: 'he-IL sign-in', path: '/he-IL/sign-in', heading: 'כניסה' },
    { name: 'en sign-in', path: '/en/sign-in', heading: 'Sign in' },
    { name: 'he-IL sign-up', path: '/he-IL/sign-up', heading: 'יצירת חשבון' },
    { name: 'he-IL forgot-password', path: '/he-IL/forgot-password', heading: 'איפוס סיסמה' },
  ] as const;

  for (const route of publicRoutes) {
    test(`${route.name} has no horizontal overflow across critical widths`, async ({ page }) => {
      for (const width of CRITICAL_OVERFLOW_WIDTHS) {
        await withViewport(page, width, async () => {
          await page.goto(route.path);
          if (route.path === '/he-IL' && page.url().includes('/setup')) {
            test.skip(true, 'homepage requires configured app');
          }
          await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
          await assertNoPageHorizontalOverflow(page, `${route.name}@${width}`);
        });
      }
    });
  }

  test('he-IL sign-in has no horizontal overflow across full screenshot matrix', async ({
    page,
  }) => {
    for (const width of PAGE_OVERFLOW_WIDTHS) {
      await withViewport(page, width, async () => {
        await page.goto('/he-IL/sign-in');
        await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();
        await assertNoPageHorizontalOverflow(page, `he-IL/sign-in@${width}`);
      });
    }
  });
});
