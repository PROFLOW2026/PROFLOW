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

/** Default project workspace URL (money / financials hub). */
export function projectWorkspaceUrl(projectId: string, tab?: string): string {
  const key = tab?.trim() || 'financials';
  if (key === 'overview' || key === 'financials') {
    return `/he-IL/projects/${projectId}`;
  }
  return `/he-IL/projects/${projectId}?tab=${key}`;
}

export const EXPECTED_PROJECT_HUBS: readonly string[] = [
  projectHubs.money,
  projectHubs.work,
  projectHubs.documents,
  projectHubs.infra,
  projectHubs.details,
];

export async function gotoProjectTab(page: Page, projectId: string, tab: string): Promise<void> {
  await page.goto(projectWorkspaceUrl(projectId, tab), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tablist')).toBeVisible({ timeout: 30_000 });
}


const SECTION_HUB_LABEL: Readonly<Record<string, string>> = {
  [projectSections.financials]: projectHubs.money,
  [projectSections.expenses]: projectHubs.money,
  [projectSections.billing]: projectHubs.money,
  [projectSections.billingPlan]: projectHubs.money,
  [projectSections.budgets]: projectHubs.money,
  [projectSections.work]: projectHubs.work,
  [projectSections.boq]: projectHubs.work,
  [projectSections.changes]: projectHubs.work,
  [projectSections.team]: projectHubs.work,
  [projectSections.time]: projectHubs.work,
  [projectSections.schedule]: projectHubs.work,
  [projectSections.usage]: projectHubs.work,
  [projectSections.documents]: projectHubs.documents,
  [projectSections.infra]: projectHubs.infra,
  [projectSections.details]: projectHubs.details,
  [projectSections.closeout]: projectHubs.details,
  [projectSections.warranty]: projectHubs.details,
};

/**
 * Open a project hub tab or, when the label is an inner section, the parent hub
 * and then the section link. Hub labels are role=tab; section labels are links.
 */
export async function clickProjectDestination(page: Page, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name: label, exact: true });
  if ((await tab.count()) > 0) {
    await tab.first().click();
    return;
  }
  const link = page.getByRole('link', { name: label, exact: true });
  if ((await link.count()) > 0 && (await link.first().isVisible())) {
    await link.first().click();
    return;
  }
  const hub = SECTION_HUB_LABEL[label];
  if (hub) {
    await page.getByRole('tab', { name: hub, exact: true }).click();
  }
  await page.getByRole('link', { name: label, exact: true }).click();
}

/** Hub tabs expose aria-selected; inner sections expose aria-current=page. */
export async function expectProjectDestinationSelected(page: Page, label: string): Promise<void> {
  const tab = page.getByRole('tab', { name: label, exact: true });
  if ((await tab.count()) > 0) {
    await expect(tab.first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const state = await tab.first().getAttribute('data-state');
        const aria = await tab.first().getAttribute('aria-selected');
        return state === 'active' || aria === 'true';
      }, { timeout: 30_000 })
      .toBe(true);
    return;
  }
  const link = page.getByRole('link', { name: label, exact: true });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute('aria-current', 'page');
}
