/**
 * Work + Details hubs must render tab content (not the project workspace error boundary).
 * Run: npx playwright test tests/e2e/authenticated/project-work-details-hubs.spec.ts --project=desktop-he-authenticated
 */
import { expect, test } from '@playwright/test';
import { he } from '../fixtures/locales';
import { clickProjectHub, gotoProjectTab, projectWorkspaceUrl } from '../fixtures/project-workspace';
import { loadWorld } from '../fixtures/world';

const workspaceErrorTitle = he.errors.errorPage.title;

test.describe('Project work and details hubs', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('mobile work and details hubs avoid workspace error boundary', async ({ page }) => {
    const world = loadWorld();

    await page.goto(projectWorkspaceUrl(world.projectId));
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await clickProjectHub(page, he.projects.workspace.hubs.work);
    await expect(page.getByRole('tab', { name: he.projects.workspace.hubs.work })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: workspaceErrorTitle })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.locator('main')).toBeVisible();

    await clickProjectHub(page, he.projects.workspace.hubs.details);
    await expect(page.getByRole('tab', { name: he.projects.workspace.hubs.details })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: workspaceErrorTitle })).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.locator('main')).toBeVisible();
  });

  test('?tab=work and ?tab=details deep links avoid workspace error boundary', async ({ page }) => {
    const world = loadWorld();

    await gotoProjectTab(page, world.projectId, 'work');
    await expect(page.getByRole('heading', { name: workspaceErrorTitle })).toHaveCount(0, {
      timeout: 30_000,
    });

    await gotoProjectTab(page, world.projectId, 'details');
    await expect(page.getByRole('heading', { name: workspaceErrorTitle })).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});
