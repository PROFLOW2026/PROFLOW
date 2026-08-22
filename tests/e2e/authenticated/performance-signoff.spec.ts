/**
 * Targeted tab-hop timing for performance sign-off (5 routes only).
 * Run: CI=1 npx playwright test tests/e2e/authenticated/performance-signoff.spec.ts --project=desktop-he-authenticated
 */
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { he } from '../fixtures/locales';
import { loadWorld } from '../fixtures/world';

type HopResult = {
  readonly hop: string;
  readonly repeatedMs: number;
};

function outPath() {
  return path.resolve(process.cwd(), 'docs/performance/SIGNOFF-AFTER.json');
}

async function clearPerf(page: Page) {
  await page.evaluate(() => {
    performance.clearResourceTimings();
    (window as unknown as { __pfStart?: number }).__pfStart = performance.now();
  });
}

async function wallMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const start = (window as unknown as { __pfStart?: number }).__pfStart ?? 0;
    return Math.round(performance.now() - start);
  });
}

async function expectTabSelected(page: Page, tabName: string) {
  const tab = page.getByRole('tab', { name: tabName });
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const state = await tab.getAttribute('data-state');
      const aria = await tab.getAttribute('aria-selected');
      return state === 'active' || aria === 'true';
    }, { timeout: 30_000 })
    .toBe(true);
}

async function expectProjectTabsInteractive(page: Page) {
  await expect
    .poll(async () => page.locator('[data-pf-project-tabs][data-pf-tabs-ready]').count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

async function gotoProjectTab(page: Page, projectId: string, tabKey: string) {
  const url =
    tabKey === 'overview'
      ? `/he-IL/projects/${projectId}`
      : `/he-IL/projects/${projectId}?tab=${tabKey}`;
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expectProjectTabsInteractive(page);
}

async function measureHop(
  page: Page,
  projectId: string,
  hop: string,
  fromKey: string,
  fromLabel: string,
  toKey: string,
  toLabel: string,
  readyExtra?: () => Promise<void>,
): Promise<HopResult> {
  await gotoProjectTab(page, projectId, fromKey);
  await expectTabSelected(page, fromLabel);

  // Prime target tab, return to source, then measure warm repeated hop.
  await page.getByRole('tab', { name: toLabel }).click();
  await expectTabSelected(page, toLabel);
  if (readyExtra) await readyExtra();

  await page.getByRole('tab', { name: fromLabel }).click();
  await expectTabSelected(page, fromLabel);

  await clearPerf(page);
  await page.getByRole('tab', { name: toLabel }).click();
  await expectTabSelected(page, toLabel);
  if (readyExtra) await readyExtra();
  await page.waitForTimeout(50);

  return { hop, repeatedMs: await wallMs(page) };
}

test.describe.configure({ mode: 'serial', retries: 0 });

test('performance sign-off — five project tab hops', async ({ page }) => {
  test.setTimeout(180_000);
  const world = loadWorld();
  const projectId = world.projectId;
  const seededProjectName = 'שיפוץ דירה ברמת גן';

  await page.goto(`/he-IL/projects/${projectId}`);
  await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible({
    timeout: 60_000,
  });
  await expectProjectTabsInteractive(page);

  const hops: HopResult[] = [];

  hops.push(
    await measureHop(
      page,
      projectId,
      'Overview → Billing Plan',
      'overview',
      he.projects.workspace.tabs.overview,
      'billingPlan',
      he.projects.workspace.tabs.billingPlan,
      async () => {
        await expect(page.getByTestId('billing-plan-panel')).toBeVisible({ timeout: 30_000 });
      },
    ),
  );

  hops.push(
    await measureHop(
      page,
      projectId,
      'Billing Plan → Billing',
      'billingPlan',
      he.projects.workspace.tabs.billingPlan,
      'billing',
      he.projects.workspace.tabs.billing,
      async () => {
        const main = page.locator('#main');
        await expect(
          main.getByText(/אין חיובים בפרויקט|רשומות חיוב|מצב חיוב וגבייה/).first(),
        ).toBeVisible({ timeout: 30_000 });
      },
    ),
  );

  hops.push(
    await measureHop(
      page,
      projectId,
      'Billing → Expenses',
      'billing',
      he.projects.workspace.tabs.billing,
      'expenses',
      he.projects.workspace.tabs.expenses,
      async () => {
        await expect(
          page.locator('#main').getByText('כבלים וחומרי חשמל').first(),
        ).toBeVisible({ timeout: 30_000 });
      },
    ),
  );

  hops.push(
    await measureHop(
      page,
      projectId,
      'Expenses → Schedule',
      'expenses',
      he.projects.workspace.tabs.expenses,
      'schedule',
      he.projects.workspace.tabs.schedule,
      async () => {
        await expect(
          page.locator('#main').getByText(/תכנון|אבני דרך|שלבים/).first(),
        ).toBeVisible({ timeout: 30_000 });
      },
    ),
  );

  hops.push(
    await measureHop(
      page,
      projectId,
      'Schedule → Overview',
      'schedule',
      he.projects.workspace.tabs.schedule,
      'overview',
      he.projects.workspace.tabs.overview,
    ),
  );

  const repeatedMs = hops.map((h) => h.repeatedMs);
  const avg = Math.round(repeatedMs.reduce((a, b) => a + b, 0) / repeatedMs.length);
  const worst = Math.max(...repeatedMs);

  const payload = {
    measuredAt: new Date().toISOString(),
    mode: 'local next build + next start (harness)',
    primaryMetric: 'wallMs — tab click until content ready',
    hops,
    averageMs: avg,
    worstMs: worst,
  };

  mkdirSync(path.dirname(outPath()), { recursive: true });
  writeFileSync(outPath(), JSON.stringify(payload, null, 2), 'utf8');

  for (const h of hops) {
    console.log(`[signoff] ${h.hop}: ${h.repeatedMs}ms`);
  }
  console.log(`[signoff] average=${avg}ms worst=${worst}ms`);
  console.log(`[signoff] wrote ${outPath()}`);

  expect(worst).toBeLessThan(2000);
});
