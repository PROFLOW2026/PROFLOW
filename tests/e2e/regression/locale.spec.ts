import { expect, test } from '@playwright/test';

/**
 * Locale direction + cookie persistence + auth-callback locale smokes.
 * Complements shell.spec.ts with explicit regression intent for owner bugs.
 */
test.describe('locale direction', () => {
  test('Hebrew critical route is dir=rtl lang=he', async ({ page }) => {
    await page.goto('/he-IL/sign-in');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'he');
    await expect(page.locator('body')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();
  });

  test('English critical route is dir=ltr lang=en', async ({ page }) => {
    await page.goto('/en/sign-in');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.locator('body')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});

test.describe('locale persistence smoke', () => {
  test('visiting an English URL remembers locale for bare redirects', async ({ page }) => {
    await page.goto('/en/sign-in');
    await expect(page).toHaveURL(/\/en\/sign-in/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/en\/sign-in/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('visiting a Hebrew URL remembers locale for bare redirects', async ({ page }) => {
    await page.goto('/he-IL/sign-in');
    await expect(page).toHaveURL(/\/he-IL\/sign-in/);

    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/he-IL\/sign-in/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();
  });

  test('Hebrew sign-up stays he-IL across refresh and deep links', async ({ page }) => {
    await page.goto('/he-IL/sign-up');
    await expect(page).toHaveURL(/\/he-IL\/sign-up/);
    await page.reload();
    await expect(page).toHaveURL(/\/he-IL\/sign-up/);

    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/he-IL\/(onboarding|sign-in|setup)/);
  });

  test('Accept-Language en does not bounce bare paths to /en without cookie', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const page = await context.newPage();

    await page.goto('/sign-in');
    await expect(page).toHaveURL(/\/he-IL\/sign-in/);
    await expect(page).not.toHaveURL(/\/en\//);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'כניסה' })).toBeVisible();

    await context.close();
  });

  test('Hebrew setup and onboarding deep links stay on he-IL', async ({ page }) => {
    await page.goto('/he-IL/setup');
    await expect(page).toHaveURL(/\/he-IL\/setup/);
    await page.reload();
    await expect(page).toHaveURL(/\/he-IL\/setup/);

    await page.goto('/he-IL/onboarding');
    await expect(page).toHaveURL(/\/he-IL\/(onboarding|sign-in|setup)/);
    await expect(page).not.toHaveURL(/\/en\//);
  });
});

test.describe('auth callback locale persistence', () => {
  test('does not rewrite /auth/callback into /en via Accept-Language', async ({ browser }) => {
    const context = await browser.newContext({
      locale: 'en-US',
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    const page = await context.newPage();

    const response = await page.goto('/auth/callback', {
      waitUntil: 'domcontentloaded',
    });
    expect(response).not.toBeNull();
    await expect(page).not.toHaveURL(/\/en\/auth\//);
    await expect(page).toHaveURL(/\/he-IL\/sign-in\?error=auth-callback/);

    await context.close();
  });

  test('honors explicit he-IL locale on the callback link', async ({ page }) => {
    await page.goto('/auth/callback?locale=he-IL&next=/onboarding');
    await expect(page).not.toHaveURL(/\/en\//);
    await expect(page).toHaveURL(/\/he-IL\/sign-in\?error=auth-callback/);
  });

  test('honors explicit en locale without trapping Hebrew default', async ({ page }) => {
    await page.goto('/auth/callback?locale=en');
    await expect(page).toHaveURL(/\/en\/sign-in\?error=auth-callback/);
  });

  test('uses NEXT_LOCALE cookie from a prior Hebrew visit', async ({ page, context }) => {
    await page.goto('/he-IL/sign-in');
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === 'NEXT_LOCALE' && cookie.value === 'he-IL')).toBe(
      true,
    );

    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/he-IL\/sign-in\?error=auth-callback/);
  });

  test('callback without locale still defaults to he-IL not en', async ({ page }) => {
    await page.goto('/auth/callback?next=/onboarding');
    await expect(page).not.toHaveURL(/\/en\//);
    await expect(page).toHaveURL(/\/he-IL\/sign-in\?error=auth-callback/);
  });
});
