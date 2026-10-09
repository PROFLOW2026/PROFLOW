import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { NAV_ITEMS } from '@/components/shell/navigation';

const resolvedRoutes = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'docs/audits/_verification-routes-resolved.json'), 'utf8'),
) as {
  routes: {
    inventoryLine: string;
    persona: string;
    urlPath: string;
    usedPlaceholder?: boolean;
  }[];
};

const OUT = path.resolve(process.cwd(), 'docs/audits/_verification-route-matrix-results.json');
const NAV_OUT = path.resolve(process.cwd(), 'docs/audits/_verification-nav-matrix-results.json');

type RouteOutcome = {
  inventoryLine: string;
  urlPath: string;
  persona: string;
  finalUrl: string;
  httpStatus: number | null;
  mainVisible: boolean;
  overflowAt320: boolean;
  scrollWidth320: number;
  clientWidth320: number;
  status:
    | 'VERIFIED_LOAD'
    | 'REDIRECT'
    | 'NOT_FOUND'
    | 'ERROR'
    | 'AUTH_GATE'
    | 'OVERFLOW_BROKEN';
  note?: string;
};

test.describe.configure({ mode: 'serial', timeout: 3_600_000 });

function summarize(rows: { status: string }[]) {
  const byStatus: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  return byStatus;
}

function writeRouteResults(
  pathOut: string,
  payload: { persona?: string; count: number; results: unknown[]; incomplete?: boolean },
): void {
  writeFileSync(
    pathOut,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...payload,
        summary: summarize(payload.results as { status: string }[]),
      },
      null,
      2,
    ),
  );
}

/** Nav first — completes even if the long owner sweep aborts mid-run. */
test('60 NAV_ITEMS — owner goto matrix', async ({ page }) => {
  const navResults: {
    key: string;
    href: string;
    urlPath: string;
    finalUrl: string;
    status: RouteOutcome['status'];
    overflowAt320: boolean;
    note?: string;
  }[] = [];

  for (const item of NAV_ITEMS) {
    await test.step(item.key, async () => {
      const urlPath = `/he-IL${item.href === '/' ? '' : item.href}`;
      try {
        await page.goto(urlPath, { waitUntil: 'commit', timeout: 45_000 });
        await page.setViewportSize({ width: 320, height: 800 });
        const layout = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const overflowAt320 = layout.scrollWidth > layout.clientWidth + 1;
        const finalUrl = page.url();
        let status: RouteOutcome['status'] = overflowAt320 ? 'OVERFLOW_BROKEN' : 'VERIFIED_LOAD';
        if (finalUrl.includes('/sign-in')) status = 'AUTH_GATE';

        navResults.push({
          key: item.key,
          href: item.href,
          urlPath,
          finalUrl,
          status,
          overflowAt320,
        });
      } catch (error) {
        navResults.push({
          key: item.key,
          href: item.href,
          urlPath,
          finalUrl: page.url(),
          status: 'ERROR',
          overflowAt320: false,
          note: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  writeRouteResults(NAV_OUT, { count: navResults.length, results: navResults });
  expect(navResults.length).toBe(NAV_ITEMS.length);
});

test('387 route inventory — owner authenticated matrix', async ({ page }) => {
  const ownerRoutes = resolvedRoutes.routes.filter((r) => r.persona === 'owner');
  const results: RouteOutcome[] = [];

  try {
    for (const route of ownerRoutes) {
      await test.step(route.inventoryLine, async () => {
        try {
          const response = await page.goto(route.urlPath, {
            waitUntil: 'commit',
            timeout: 45_000,
          });
          const status = response?.status() ?? null;
          await page.setViewportSize({ width: 320, height: 800 });
          const layout = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          const mainVisible = (await page.locator('main').count()) > 0;
          const finalUrl = page.url();
          const overflowAt320 = layout.scrollWidth > layout.clientWidth + 1;

          let outcome: RouteOutcome['status'] = 'VERIFIED_LOAD';
          if (status === 404) outcome = 'NOT_FOUND';
          else if (status && status >= 500) outcome = 'ERROR';
          else if (finalUrl.includes('/sign-in')) outcome = 'AUTH_GATE';
          else if (overflowAt320) outcome = 'OVERFLOW_BROKEN';
          else if (!finalUrl.includes(route.urlPath.split('?')[0]!) && status && status < 400) {
            outcome = 'REDIRECT';
          }

          results.push({
            inventoryLine: route.inventoryLine,
            urlPath: route.urlPath,
            persona: route.persona,
            finalUrl,
            httpStatus: status,
            mainVisible,
            overflowAt320,
            scrollWidth320: layout.scrollWidth,
            clientWidth320: layout.clientWidth,
            status: outcome,
            note: route.usedPlaceholder ? 'placeholder-id-segment' : undefined,
          });
        } catch (error) {
          results.push({
            inventoryLine: route.inventoryLine,
            urlPath: route.urlPath,
            persona: route.persona,
            finalUrl: page.url(),
            httpStatus: null,
            mainVisible: false,
            overflowAt320: false,
            scrollWidth320: 0,
            clientWidth320: 0,
            status: 'ERROR',
            note: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  } finally {
    writeRouteResults(OUT, {
      persona: 'owner',
      count: results.length,
      results,
      incomplete: results.length !== ownerRoutes.length,
    });
  }

  expect(results.length).toBe(ownerRoutes.length);
});
