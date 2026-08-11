import { expect, test, type Page } from '@playwright/test';
import { formatMoney } from '@/shared/money/format';
import {
  ELECTRICAL_OWNER,
  FIELD_OWNER,
  FINANCE,
  GC_OWNER,
  MAINTENANCE_OWNER,
  MANAGER,
  MIXED_OWNER,
  OWNER,
  PLUMBING_OWNER,
} from '../harness/config';
import { he } from '../fixtures/locales';
import { signInThroughForm } from '../fixtures/sign-in';
import { loadWorld } from '../fixtures/world';

const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';
const contractValueFormatted = formatMoney({ amount: '150000', currency: 'ILS' }, 'he-IL');

async function firstQuickCreateLabel(page: Page): Promise<string> {
  await page.getByRole('button', { name: he.nav.newMenu.trigger }).click();
  const item = page.getByRole('menuitem').first();
  await expect(item).toBeVisible();
  return (await item.innerText()).trim();
}

async function expectActualExplainability(page: Page): Promise<void> {
  const actual = page.getByRole('button', { name: new RegExp(he.financial.kpis.actualCost) });
  await expect(actual).toBeVisible();
  await actual.click();
  await expect(page.getByText(he.financial.explain.whyThisNumber).first()).toBeVisible();
  await expect(page.getByText(he.financial.kpis.recognizedOriginal).first()).toBeVisible();
  await expect(page.getByText(he.financial.kpis.monthCloseCost).first()).toBeVisible();
}

test.describe('simple organization (seeded, no business profile)', () => {
  test('owner dashboard and project financial Actual remain usable', async ({ page }) => {
    await signInThroughForm(page, OWNER.email);
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expectActualExplainability(page);
    await expect(page.getByText(contractValueFormatted).first()).toBeVisible();
  });
});

test.describe('manager persona', () => {
  test('runs projects and costs without profit or people admin', async ({ page }) => {
    await signInThroughForm(page, MANAGER.email);
    const nav = page.getByRole('navigation', { name: he.common.a11y.mainNavigation });
    await expect(nav.getByRole('link', { name: he.nav.projects })).toBeVisible();
    await expect(nav.getByRole('link', { name: he.nav.expenses })).toBeVisible();

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
    await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.financials })).toBeVisible();
    await expectActualExplainability(page);
    await expect(page.getByText(he.financial.kpis.actualMargin)).toHaveCount(0);

    await page.goto('/he-IL/settings/people');
    await expect(page.getByRole('heading', { name: he.organization.members.title }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: he.organization.invitations.title })).toHaveCount(0);
    await expect(page.getByRole('button', { name: he.organization.invitations.send })).toHaveCount(0);
    await expect(page.getByRole('button', { name: he.organization.members.remove })).toHaveCount(0);
  });
});

test.describe('finance persona', () => {
  test('reaches billing, expenses, month close and profit', async ({ page }) => {
    await signInThroughForm(page, FINANCE.email);
    const nav = page.getByRole('navigation', { name: he.common.a11y.mainNavigation });
    await expect(nav.getByRole('link', { name: he.nav.billing })).toBeVisible();
    await expect(nav.getByRole('link', { name: he.nav.expenses })).toBeVisible();

    const billingLink = nav.getByRole('link', { name: he.nav.billing });
    if ((await billingLink.count()) > 0) {
      await billingLink.click();
    } else {
      await page.goto('/he-IL/billing');
    }
    await expect(page).toHaveURL(/\/he-IL\/billing/);

    await page.goto('/he-IL/month-close');
    await expect(page.getByRole('heading', { name: he.nav.monthClose }).first()).toBeVisible();

    await page.goto(`/he-IL/projects/${world.projectId}?tab=financials`);
    await expectActualExplainability(page);
    await expect(
      page.getByRole('button', { name: new RegExp(he.financial.kpis.actualMargin) }),
    ).toBeVisible();
  });
});

test.describe('business-profile Quick Create defaults', () => {
  test('general contractor pins project first', async ({ page }) => {
    await signInThroughForm(page, GC_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.project);
  });

  test('electrical pins job first', async ({ page }) => {
    await signInThroughForm(page, ELECTRICAL_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.job);
    await page.goto('/he-IL/projects/new');
    await expect(page.getByText(he.projects.create.usualKind.jobTitle)).toBeVisible();
  });

  test('plumbing pins job first', async ({ page }) => {
    await signInThroughForm(page, PLUMBING_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.job);
  });

  test('maintenance pins work order first', async ({ page }) => {
    await signInThroughForm(page, MAINTENANCE_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.service);
    await page.goto('/he-IL/projects/new');
    await expect(page.getByText(he.projects.create.usualKind.workOrderTitle)).toBeVisible();
  });

  test('field service pins work order first', async ({ page }) => {
    await signInThroughForm(page, FIELD_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.service);
  });

  test('mixed organization pins project first and keeps service nearby', async ({ page }) => {
    await signInThroughForm(page, MIXED_OWNER.email);
    await expect(await firstQuickCreateLabel(page)).toBe(he.nav.newMenu.project);
    await expect(page.getByRole('menuitem', { name: he.nav.newMenu.service })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: he.nav.newMenu.job })).toBeVisible();
  });
});
