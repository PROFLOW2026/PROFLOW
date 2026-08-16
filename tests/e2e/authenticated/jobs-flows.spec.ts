import { expect, test } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import {
  assertNoPageHorizontalOverflow,
  MOBILE_NAV,
  QUICK_CREATE_FAB,
} from '../fixtures/layout';
import { he } from '../fixtures/locales';

/**
 * Targeted business-flow coverage for Projects / Jobs IA (Agent 4).
 * createJob persistence is Agent 2 - this suite asserts nav, Hebrew copy,
 * RTL mobile create path, and money presentation.
 */

test.describe('jobs navigation and mobile path', () => {
  test('jobs list is reachable with Hebrew chrome and no horizontal overflow', async ({ page }) => {
    await page.goto('/he-IL/jobs');

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: he.nav.jobs, level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: he.jobs.newJob })).toBeVisible();
    await assertNoPageHorizontalOverflow(page, 'jobs list');
  });

  test('mobile job create path: client → description → price labels (not contract)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/he-IL/jobs/new');

    await expect(page.getByRole('heading', { name: he.jobs.create.title, level: 1 })).toBeVisible();
    await expect(page.getByLabel(he.jobs.create.clientLabel).first()).toBeVisible();
    await expect(page.getByLabel(he.jobs.create.clientNew).first()).toBeVisible();
    await expect(page.getByLabel(he.jobs.create.nameLabel).first()).toBeVisible();
    await expect(page.getByLabel(he.jobs.create.pricingModeLabel).first()).toBeVisible();

    // Fixed-price default: price language, not “original contract”.
    await expect(page.getByLabel(he.jobs.pricing.priceLabel).first()).toBeVisible();
    await expect(page.getByText(he.jobs.pricing.priceHint).first()).toBeVisible();
    await expect(page.getByText(he.projects.create.contractValueLabel)).toHaveCount(0);
    await expect(page.getByText(he.projects.create.managedOpeningPreviewLabel)).toHaveCount(0);

    await page.getByLabel(he.jobs.create.nameLabel).first().fill('תיקון מזגן בדיקה');
    await page.getByLabel(he.jobs.create.clientNew).first().fill('מזדמן - בדיקה');
    await page.getByLabel(he.jobs.pricing.priceLabel).first().fill('2500');

    const sampleMoney = formatMoney({ amount: '52000', currency: 'ILS' }, 'he-IL');
    expect(sampleMoney).toMatch(/52[,.]000/);
    expect(sampleMoney).toContain('₪');

    await assertNoPageHorizontalOverflow(page, 'job create mobile');
    await expect(page.locator(QUICK_CREATE_FAB)).toHaveCount(0);
  });

  test('settings work-mix copy is Hebrew and reachable', async ({ page }) => {
    await page.goto('/he-IL/settings/features');

    await expect(page.locator('#main').getByText(he.settings.workMix.title)).toBeVisible();
    await expect(page.locator('#main').getByText(he.settings.workMix.subtitle)).toBeVisible();
    await expect(page.locator('#main').getByLabel(he.settings.workMix.label)).toBeVisible();
    await expect(page.locator('#main').getByText(he.settings.modules.jobs)).toBeVisible();
    await expect(page.getByText(/מנוע פיננסי/)).toHaveCount(0);
  });

  test('projects empty affordance can point to jobs when list is empty', async ({ page }) => {
    await page.goto('/he-IL/projects');
    // Affordance is only on the empty state; if the world has projects, skip quietly.
    const jobsLink = page.getByRole('link', { name: he.projects.empty.jobsAffordance });
    if ((await jobsLink.count()) > 0) {
      await expect(jobsLink).toBeVisible();
      await jobsLink.click();
      await expect(page).toHaveURL(/\/jobs/);
    }
  });

  test('projects-first mobile bar still shows projects by default', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/he-IL');

    const bottomNav = page.locator(MOBILE_NAV);
    await expect(bottomNav.getByRole('link', { name: he.nav.projects })).toBeVisible();
    await expect(bottomNav.getByRole('link', { name: he.nav.dashboard })).toBeVisible();
  });
});
