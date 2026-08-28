import { expect, test } from '@playwright/test';
import { OWNER } from '../harness/config';
import { he } from '../fixtures/locales';
import { clickNavLink } from '../fixtures/nav';
import {
  expectProjectHeading,
  expectProjectHubTabs,
  projectHubs,
} from '../fixtures/project-workspace';
import { loadWorld } from '../fixtures/world';

/**
 * Tier-1 release smoke — essential owner availability after UX/navigation changes.
 * Kept intentionally small so normal pushes stay fast in CI.
 */
const world = loadWorld();
const seededProjectName = 'שיפוץ דירה ברמת גן';

test.describe('release smoke', () => {
  test('owner dashboard and Hebrew shell', async ({ page }) => {
    await page.goto('/he-IL', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('navigation', { name: he.common.a11y.mainNavigation })).toBeVisible();
  });

  test('projects list loads', async ({ page }) => {
    await page.goto('/he-IL/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: he.nav.projects, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(seededProjectName).first()).toBeVisible();
  });

  test('one project loads with five primary hubs', async ({ page }) => {
    await page.goto(`/he-IL/projects/${world.projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tablist')).toBeVisible({ timeout: 30_000 });
    await expectProjectHeading(page, seededProjectName);
    await expectProjectHubTabs(page, [
      projectHubs.overview,
      projectHubs.money,
      projectHubs.work,
      projectHubs.documents,
      projectHubs.details,
    ]);
  });

  test('expenses list loads', async ({ page }) => {
    await page.goto('/he-IL/expenses', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: he.expenses.title, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('primary navigation reaches projects from dashboard', async ({ page }) => {
    await page.goto('/he-IL', { waitUntil: 'domcontentloaded' });
    await clickNavLink(page, he.nav.projects);
    await expect(page).toHaveURL(/\/he-IL\/projects/);
  });
});
