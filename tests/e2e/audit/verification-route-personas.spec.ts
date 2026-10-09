import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { E2E_GC_CONTRACTOR, E2E_GC_OPS_EMPLOYEE, SEED_PASSWORD } from '../harness/config';
import { loadWorld } from '../fixtures/world';

const resolvedRoutes = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'docs/audits/_verification-routes-resolved.json'), 'utf8'),
) as {
  routes: { inventoryLine: string; persona: string; urlPath: string }[];
};

const OUT = path.resolve(process.cwd(), 'docs/audits/_verification-route-personas-results.json');

test.describe.configure({ mode: 'serial', timeout: 2_400_000 });

async function contractorSignIn(page: Page): Promise<void> {
  await page.goto('/he-IL/contractor/sign-in', { waitUntil: 'commit' });
  const user = page.locator('#contractor-username');
  const target = (await user.locator('input').count()) > 0 ? user.locator('input') : user;
  await target.fill(E2E_GC_CONTRACTOR.username);
  const pass = page.locator('#contractor-password');
  const passTarget = (await pass.locator('input').count()) > 0 ? pass.locator('input') : pass;
  await passTarget.fill(SEED_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 60_000 });
}

async function employeeSignIn(page: Page): Promise<void> {
  const world = loadWorld();
  await page.goto('/he-IL/employee/login', { waitUntil: 'commit' });
  await page.locator('#username').fill(world.gcOpsUsername ?? E2E_GC_OPS_EMPLOYEE.username);
  await page.locator('#pin').fill(E2E_GC_OPS_EMPLOYEE.pin);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60_000 });
}

test('non-owner route personas matrix', async ({ page }) => {
  const personas = ['public', 'contractor', 'employee'] as const;
  const allResults: Record<'public' | 'contractor' | 'employee', unknown[]> = {
    public: [],
    contractor: [],
    employee: [],
  };
  const loginBlockers: Record<string, string | null> = {
    public: null,
    contractor: null,
    employee: null,
  };

  try {
    for (const persona of personas) {
      const routes = resolvedRoutes.routes.filter((r) => r.persona === persona);
      if (persona === 'contractor') {
        try {
          await contractorSignIn(page);
        } catch (error) {
          loginBlockers.contractor = error instanceof Error ? error.message : String(error);
        }
      }
      if (persona === 'employee') {
        try {
          await employeeSignIn(page);
        } catch (error) {
          loginBlockers.employee = error instanceof Error ? error.message : String(error);
        }
      }

      const results: unknown[] = [];
      for (const route of routes) {
        await test.step(`${persona}:${route.inventoryLine}`, async () => {
          if (loginBlockers[persona]) {
            results.push({
              inventoryLine: route.inventoryLine,
              urlPath: route.urlPath,
              status: 'AUTH_GATE',
              note: `login-blocked: ${loginBlockers[persona]}`,
            });
            return;
          }
          try {
            const response = await page.goto(route.urlPath, {
              waitUntil: 'commit',
              timeout: 45_000,
            });
            await page.setViewportSize({ width: 390, height: 844 });
            const layout = await page.evaluate(() => ({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
            }));
            results.push({
              inventoryLine: route.inventoryLine,
              urlPath: route.urlPath,
              httpStatus: response?.status() ?? null,
              finalUrl: page.url(),
              overflowAt390: layout.scrollWidth > layout.clientWidth + 1,
            });
          } catch (error) {
            results.push({
              inventoryLine: route.inventoryLine,
              urlPath: route.urlPath,
              status: 'ERROR',
              note: error instanceof Error ? error.message : String(error),
            });
          }
        });
      }
      allResults[persona] = results;
      if (persona !== 'public') {
        await page.context().clearCookies();
      }
    }
  } finally {
    writeFileSync(
      OUT,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), loginBlockers, personas: allResults },
        null,
        2,
      ),
    );
  }

  expect(loadWorld().projectId).toBeTruthy();
  expect(allResults.public.length + allResults.contractor.length + allResults.employee.length).toBe(
    resolvedRoutes.routes.filter((r) => r.persona !== 'owner').length,
  );
});
