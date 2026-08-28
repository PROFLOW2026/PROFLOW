import { expect, type Page } from '@playwright/test';
import { he } from './locales';

/** Top-level project workspace hubs (owner-facing). */
export const projectHubs = he.projects.workspace.hubs;

/** Inner sections within a hub (legacy ?tab= labels). */
export const projectSections = he.projects.workspace.tabs;

export async function expectProjectHeading(page: Page, projectName: string): Promise<void> {
  await expect(page.locator('h1').filter({ hasText: projectName })).toBeVisible({
    timeout: 30_000,
  });
}

export async function expectProjectHubTabs(
  page: Page,
  hubLabels: readonly string[],
): Promise<void> {
  for (const label of hubLabels) {
    await expect(page.getByRole('tab', { name: label })).toBeVisible();
  }
}

export async function clickProjectHub(page: Page, hubLabel: string): Promise<void> {
  await page.getByRole('tab', { name: hubLabel }).click();
}

export async function clickProjectSection(page: Page, sectionLabel: string): Promise<void> {
  await page.getByRole('link', { name: sectionLabel, exact: true }).click();
}

export async function gotoProjectTab(page: Page, projectId: string, tab: string): Promise<void> {
  await page.goto(`/he-IL/projects/${projectId}?tab=${tab}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 30_000 });
}
