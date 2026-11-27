import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import { OWNER } from '../harness/config';

const DESIGN_SWITCHER = 'בחירת מצב תצוגה';
const SEEDED_PROJECT_NAME = 'שיפוץ דירה ברמת גן';
const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');

const ALLOWED_DESIGN_FAMILIES = [
  'home-dual',
  'list',
  'finance',
  'settings',
  'form',
  'detail',
  'project-home',
  'surface-home',
] as const;

type DesignMode = 'current' | 'v9' | 'v10';

type StaticRoute = {
  path: string;
  expectedFamilyHint?: string;
};

/**
 * Representative authenticated product paths (static; no dynamic ids).
 * Deliberately not opened in this spec (need a concrete id/token from seed/runtime):
 * - task detail pages under a project/work item
 * - PDF import flows tied to a document id
 * - live share / public token routes
 * - takeoff session routes with a takeoff id
 */
const STATIC_ROUTES: StaticRoute[] = [
  { path: '/he-IL', expectedFamilyHint: 'home-dual' },
  { path: '/he-IL/projects', expectedFamilyHint: 'list' },
  { path: '/he-IL/projects/new', expectedFamilyHint: 'form' },
  { path: '/he-IL/work', expectedFamilyHint: 'list or surface-home' },
  { path: '/he-IL/work/list', expectedFamilyHint: 'list' },
  { path: '/he-IL/expenses', expectedFamilyHint: 'list' },
  { path: '/he-IL/reports', expectedFamilyHint: 'list or detail' },
  { path: '/he-IL/financials/overview', expectedFamilyHint: 'finance' },
  { path: '/he-IL/billing', expectedFamilyHint: 'list or finance' },
  { path: '/he-IL/documents', expectedFamilyHint: 'list' },
  { path: '/he-IL/settings', expectedFamilyHint: 'settings' },
  { path: '/he-IL/clients', expectedFamilyHint: 'list' },
  { path: '/he-IL/today', expectedFamilyHint: 'list or surface-home' },
];

test.describe('design route coverage on local harness (he-IL)', () => {
  test.describe.configure({ timeout: 300_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('employee login (signed out) has no product design scope', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.context().clearCookies();
    await page.goto('/he-IL/employee/login');
    assertLocalHarness(page);
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('[data-pf-design-scope="product"]')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('owner loads representative routes across Current, V9, and V10', async ({ page }) => {
    const errors = collectPageErrors(page);
    const failedRoutes: string[] = [];
    const recordedFamilies: { design: DesignMode; path: string; family: string }[] = [];

    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);

    await chooseDesign(page, 'נוכחי');
    for (const route of STATIC_ROUTES) {
      await visitStaticRoute(page, route.path, 'current', failedRoutes, recordedFamilies, {
        assertFamily: false,
      });
    }

    await chooseDesign(page, 'V9');
    for (const route of STATIC_ROUTES) {
      await visitStaticRoute(page, route.path, 'v9', failedRoutes, recordedFamilies, {
        assertFamily: true,
      });
    }

    await page.goto('/he-IL/projects');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();
    await page.screenshot({ path: shot('routes-projects-v9.png') });

    await page.goto('/he-IL/projects');
    await page.getByRole('link', { name: SEEDED_PROJECT_NAME }).first().click();
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();
    await expect(page.locator('[data-pf-design-family="project-home"]')).toBeVisible();

    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 90_000 });
    const tabs = page.getByRole('tab');
    if ((await tabs.count()) > 0) {
      const nextTab = page.getByRole('tab', { selected: false }).first();
      if (await nextTab.isVisible().catch(() => false)) {
        await nextTab.click();
      }
    }

    await chooseDesign(page, 'V10');
    for (const route of STATIC_ROUTES) {
      await visitStaticRoute(page, route.path, 'v10', failedRoutes, recordedFamilies, {
        assertFamily: true,
      });
    }

    await page.goto('/he-IL/reports');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible();
    await page.screenshot({ path: shot('routes-reports-v10.png') });

    const familyReport = recordedFamilies.map((row) => `${row.design} ${row.path} → ${row.family}`).join('\n');
    expect(failedRoutes, `${failedRoutes.join('\n')}\n\nRecorded families:\n${familyReport}`).toEqual([]);
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
    throw new Error('design-route-coverage spec only runs against the local harness (loopback)');
  }
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}

async function openAppearanceMenu(page: Page): Promise<void> {
  const header = page.getByRole('button', { name: DESIGN_SWITCHER });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
    return;
  }
  await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
}

async function visitStaticRoute(
  page: Page,
  routePath: string,
  design: DesignMode,
  failedRoutes: string[],
  recordedFamilies: { design: DesignMode; path: string; family: string }[],
  { assertFamily }: { assertFamily: boolean },
): Promise<void> {
  const label = `${design} ${routePath}`;
  const response = await page.goto(routePath, { waitUntil: 'domcontentloaded' });
  assertLocalHarness(page);

  if (response && response.status() === 404) {
    failedRoutes.push(`${label} (HTTP 404)`);
    return;
  }

  const errorRetry = page.getByRole('button', { name: he.errors.errorPage.retry });
  if (await errorRetry.isVisible().catch(() => false)) {
    failedRoutes.push(`${label} (error boundary)`);
    return;
  }

  const shell = page.locator('[data-pf-shell="app"]');
  try {
    await expect(shell).toBeVisible({ timeout: 60_000 });
  } catch {
    failedRoutes.push(`${label} (shell never visible)`);
    return;
  }

  if (!assertFamily) {
    return;
  }

  const familyLocator = page.locator('[data-pf-design-family]').first();
  try {
    await expect(familyLocator).toBeVisible({ timeout: 20_000 });
  } catch {
    failedRoutes.push(`${label} (missing data-pf-design-family for ${design})`);
    return;
  }

  const family = (await familyLocator.getAttribute('data-pf-design-family')) ?? '';
  recordedFamilies.push({ design, path: routePath, family });

  if (!ALLOWED_DESIGN_FAMILIES.includes(family as (typeof ALLOWED_DESIGN_FAMILIES)[number])) {
    failedRoutes.push(`${label} (unexpected family "${family}")`);
  }
}