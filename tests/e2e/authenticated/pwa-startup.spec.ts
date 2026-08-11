import { expect, test, type Page, type Response } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { APP_URL, OWNER } from '../harness/config';

type StartupSample = {
  label: string;
  hops: string[];
  finalUrl: string;
  shellMs: number;
  chromeMs: number;
  usableMs: number;
  swControlled: boolean;
  navigationPreload: boolean | null;
};

function persist(payload: unknown) {
  const dir = path.resolve(process.cwd(), 'docs/performance');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'PWA-STARTUP.json'), JSON.stringify(payload, null, 2), 'utf8');
}

async function waitUsable(page: Page) {
  await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible({
    timeout: 30_000,
  });
}

async function measureLaunch(page: Page, url: string, label: string): Promise<StartupSample> {
  const hops: string[] = [];
  const onResponse = (response: Response) => {
    if (response.request().resourceType() === 'document') {
      hops.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  };
  page.on('response', onResponse);

  try {
    const started = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: 30_000 });
    const shellMs = Date.now() - started;

    const chrome = page.locator('[data-pf-mobile-nav], [aria-label="ניווט ראשי"]');
    await expect(chrome.first()).toBeVisible({ timeout: 30_000 });
    const chromeMs = Date.now() - started;

    await waitUsable(page);
    const usableMs = Date.now() - started;

    const sw = await page.evaluate(async () => {
      const controlled = Boolean(navigator.serviceWorker?.controller);
      let navigationPreload: boolean | null = null;
      if (navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg?.navigationPreload) {
        const state = await reg.navigationPreload.getState();
        navigationPreload = state.enabled ?? null;
        }
      }
      return { controlled, navigationPreload };
    });

    return {
      label,
      hops,
      finalUrl: new URL(page.url()).pathname,
      shellMs,
      chromeMs,
      usableMs,
      swControlled: sw.controlled,
      navigationPreload: sw.navigationPreload,
    };
  } finally {
    page.off('response', onResponse);
  }
}

test.describe('installed-app / PWA startup', () => {
  test.describe.configure({ mode: 'serial' });

  test('manifest start_url is locale-prefixed and SW enables navigation preload', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'NEXT_LOCALE',
        value: 'he-IL',
        url: APP_URL,
      },
    ]);

    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBe(true);
    const body = (await manifest.json()) as { start_url: string; display: string };
    expect(body.display).toBe('standalone');
    expect(body.start_url).toBe('/he-IL');

    const sw = await page.request.get('/sw.js');
    expect(sw.ok()).toBe(true);
    const source = await sw.text();
    expect(source).toContain('navigationPreload.enable');
    expect(source).toContain('preloadResponse');
  });

  test('cold then warm launch from start_url paints a usable authenticated screen', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const root = await measureLaunch(page, '/', 'cold start_url / (rewrite)');
    expect(root.finalUrl === '/' || root.finalUrl === '/he-IL' || root.finalUrl === '/he-IL/').toBe(
      true,
    );
    expect(root.usableMs).toBeLessThan(8_000);

    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return;
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    });

    const prefixedCold = await measureLaunch(page, '/he-IL', 'cold /he-IL with SW');
    const prefixedWarm = await measureLaunch(page, '/he-IL', 'warm /he-IL with SW');

    persist({
      measuredAt: new Date().toISOString(),
      note: 'Playwright Chromium on the e2e harness. Android SW-boot delay is larger; navigation preload + / rewrite are the installed-app fixes.',
      results: [root, prefixedCold, prefixedWarm],
    });

    expect(prefixedCold.usableMs).toBeLessThan(8_000);
    expect(prefixedWarm.usableMs).toBeLessThan(5_000);
    await expect(page.locator('[data-pf-dashboard-home]')).toBeVisible();
  });
});
