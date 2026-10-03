import { expect, test } from '@playwright/test';
import { assertNoPageHorizontalOverflow, withViewport } from '../fixtures/layout';

test.describe('legal public routes (L1/L2 smoke)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/he-IL');
    if (page.url().includes('/setup')) {
      test.skip(true, 'App not configured');
    }
  });

  test('marketing footer links reach Hebrew Terms and Privacy', async ({ page }) => {
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole('link', { name: 'תנאי שימוש' }).click();
    await expect(page).toHaveURL(/\/he-IL\/legal\/terms/);
    await expect(page.getByRole('heading', { name: /תנאי שימוש/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.goto('/he-IL');
    await footer.scrollIntoViewIfNeeded();
    await footer.getByRole('link', { name: 'מדיניות פרטיות' }).click();
    await expect(page).toHaveURL(/\/he-IL\/legal\/privacy/);
    await expect(page.getByRole('heading', { name: /מדיניות פרטיות|פרטיות/ })).toBeVisible();
  });

  test('auth sign-in shows legal footer links', async ({ page }) => {
    await page.goto('/he-IL/sign-in');
    await expect(page.getByRole('link', { name: 'תנאי שימוש' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'מדיניות פרטיות' })).toBeVisible();
  });

  test('sign-up shows Hebrew legal acceptance links', async ({ page }) => {
    await page.goto('/he-IL/sign-up');
    await expect(page.getByRole('link', { name: 'תנאי שימוש' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'מדיניות פרטיות' })).toBeVisible();
  });

  test('direct unauthenticated legal pages — no auth redirect, mobile RTL', async ({ page }) => {
    await withViewport(page, 390, async () => {
      await page.goto('/he-IL/legal/terms');
      await expect(page).not.toHaveURL(/sign-in/);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await assertNoPageHorizontalOverflow(page, 'terms mobile');

      await page.goto('/he-IL/legal/privacy');
      await expect(page).not.toHaveURL(/sign-in/);
      await assertNoPageHorizontalOverflow(page, 'privacy mobile');
    });
  });

  test('legal pages do not contain fabricated operator registration placeholders', async ({
    page,
  }) => {
    await page.goto('/he-IL/legal/terms');
    const termsText = await page.locator('main').innerText();
    expect(termsText).not.toMatch(/123456789|ח\.פ\.\s*000/);
    expect(termsText).not.toMatch(/example\.com@legal/);

    await page.goto('/he-IL/legal/privacy');
    const privacyText = await page.locator('main').innerText();
    expect(privacyText).toContain('אין מחיקה עצמית');
  });
});
