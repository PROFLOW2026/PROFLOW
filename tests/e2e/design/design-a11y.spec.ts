import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import { OWNER } from '../harness/config';

const DESIGN_SWITCHER = 'בחירת מצב תצוגה';
const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');
const DASHBOARD_WIDTHS = [1440, 768, 390, 320] as const;

/** Matches the reduced-motion rule (0.01ms). Chromium reports that computed value as 1e-05s. */
const REDUCED_MOTION_OK = new Set(['0s', '0ms', '0.01ms', '1e-05s', '0.00001s', 'none', 'unset', 'initial']);

test.describe('product design accessibility on local harness (he-IL)', () => {
  test.describe.configure({ timeout: 240_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('rtl, overflow, keyboard, reduced motion, dialog, styles, and screenshots', async ({ page }) => {
    const errors = collectPageErrors(page);
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);
    await chooseDesign(page, 'נוכחי');

    for (const width of DASHBOARD_WIDTHS) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      await page.goto('/he-IL');
      await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 90_000 });
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'current');
      await assertDocumentNotHorizontallyOverflowing(page);
      if (width === 320) {
        await page.screenshot({ path: shot('a11y-current-320.png') });
      }
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/he-IL/projects');
    await expect(page.getByRole('heading', { name: he.projects.title, level: 1 })).toBeVisible({
      timeout: 90_000,
    });
    const projectsPath = new URL(page.url()).pathname;

    await chooseDesign(page, 'V9');
    expect(new URL(page.url()).pathname).toBe(projectsPath);
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    await assertDocumentNotHorizontallyOverflowing(page);

    await chooseDesign(page, 'V10');
    expect(new URL(page.url()).pathname).toBe(projectsPath);
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await assertDocumentNotHorizontallyOverflowing(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/he-IL');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 90_000 });
    const trigger = page.getByRole('button', { name: DESIGN_SWITCHER });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const v9Item = page.getByRole('menuitem', { name: 'V9', exact: true });
    await expect(v9Item).toBeVisible();
    await v9Item.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    if (await page.getByRole('menu').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
    }

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(page.locator('[data-pf-design-scope="product"]')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    const motion = await page.evaluate(() => {
      const scope = document.querySelector('[data-pf-design-scope="product"]');
      const probe = scope?.querySelector('*') ?? scope ?? document.documentElement;
      const style = window.getComputedStyle(probe);
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      };
    });
    expect(
      REDUCED_MOTION_OK.has(motion.animationDuration),
      `animation-duration should be reduced (got ${motion.animationDuration})`,
    ).toBe(true);
    expect(
      REDUCED_MOTION_OK.has(motion.transitionDuration),
      `transition-duration should be reduced (got ${motion.transitionDuration})`,
    ).toBe(true);

    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const userMenuTrigger = page.getByRole('button', { name: he.common.a11y.userMenu });
    await userMenuTrigger.click();
    await expect(page.getByRole('menuitem', { name: he.nav.user.profile })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: he.nav.user.profile })).toBeHidden();
    await expect(userMenuTrigger).toHaveAttribute('aria-expanded', 'false');

    await chooseDesign(page, 'נוכחי');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'current');

    await chooseStyle(page, 'קלאסי');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'classic');
    await chooseStyle(page, 'מודרני');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'modern');
    await chooseStyle(page, 'פרימיום');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');

    await chooseDesign(page, 'V9');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v9');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');

    await chooseDesign(page, 'נוכחי');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'current');
    await expect(page.locator('html')).toHaveAttribute('data-pf-style', 'premium');

    await page.setViewportSize({ width: 390, height: 844 });
    await chooseDesign(page, 'V10');
    await expect(page.locator('html')).toHaveAttribute('data-pf-design', 'v10');
    await page.screenshot({ path: shot('a11y-v10-390.png') });

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function assertLocalHarness(page: Page): void {
  const host = new URL(page.url()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('design-a11y spec only runs against the local harness');
  }
}

async function openAppearanceMenu(page: Page): Promise<void> {
  const header = page.getByRole('button', { name: DESIGN_SWITCHER });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
    return;
  }
  await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}

async function chooseStyle(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
}

async function assertDocumentNotHorizontallyOverflowing(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}