/**
 * One-shot production-mode navigation timing verification.
 * Run: npx playwright test tests/e2e/authenticated/performance-verify.spec.ts --project=desktop-he-authenticated
 */
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { OWNER } from '../harness/config';
import { he } from '../fixtures/locales';
import { clickNavLink } from '../fixtures/nav';
import { loadWorld } from '../fixtures/world';

type ResourceMetric = {
  name: string;
  duration: number;
  transferSize: number;
  encodedBodySize: number;
  ttfb: number;
};

type Sample = {
  wallMs: number;
  navDurationMs: number | null;
  ttfbMs: number | null;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  rscCount: number;
  rscTotalDurationMs: number;
  rscMaxDurationMs: number;
  rscTotalTransferBytes: number;
  rscMaxTtfbMs: number;
  resources: ResourceMetric[];
};

type FlowResult = {
  flow: string;
  firstMs: number;
  repeatedMs: number | null;
  classification: 'FAST' | 'ACCEPTABLE' | 'NOTICEABLE' | 'SLOW' | 'INITIAL_HEAVY';
  first: Sample;
  repeated: Sample | null;
  note?: string;
};

function classify(ms: number, initial = false): FlowResult['classification'] {
  if (initial) return 'INITIAL_HEAVY';
  if (ms < 500) return 'FAST';
  if (ms < 1000) return 'ACCEPTABLE';
  if (ms < 2000) return 'NOTICEABLE';
  return 'SLOW';
}

function outPath() {
  return path.resolve(process.cwd(), 'docs/performance/LIVE-VERIFICATION.json');
}

function persist(payload: unknown) {
  const dir = path.resolve(process.cwd(), 'docs/performance');
  mkdirSync(dir, { recursive: true });
  writeFileSync(outPath(), JSON.stringify(payload, null, 2), 'utf8');
}

async function clearPerf(page: Page) {
  await page.evaluate(() => {
    performance.clearResourceTimings();
    (window as unknown as { __pfStart?: number }).__pfStart = performance.now();
  });
}

async function collectSample(page: Page, fullNavigation: boolean): Promise<Sample> {
  return page.evaluate((isFull) => {
    const start = (window as unknown as { __pfStart?: number }).__pfStart ?? 0;
    const wallMs = performance.now() - start;

    let navDurationMs: number | null = null;
    let ttfbMs: number | null = null;
    let domContentLoadedMs: number | null = null;
    let loadEventMs: number | null = null;

    if (isFull) {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        navDurationMs = nav.duration;
        ttfbMs = nav.responseStart;
        domContentLoadedMs = nav.domContentLoadedEventEnd;
        loadEventMs = nav.loadEventEnd;
      }
    }

    const rsc = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes('_rsc'))
      .map((e) => {
        const r = e as PerformanceResourceTiming;
        return {
          name: r.name.replace(/^https?:\/\/[^/]+/, '').slice(0, 120),
          duration: r.duration,
          transferSize: r.transferSize || 0,
          encodedBodySize: r.encodedBodySize || 0,
          ttfb: Math.max(0, r.responseStart - r.requestStart),
        };
      });

    const rscDurations = rsc.map((r) => r.duration);
    const rscTtfbs = rsc.map((r) => r.ttfb);

    return {
      wallMs: Math.round(wallMs),
      navDurationMs: navDurationMs === null ? null : Math.round(navDurationMs),
      ttfbMs: ttfbMs === null ? null : Math.round(ttfbMs),
      domContentLoadedMs: domContentLoadedMs === null ? null : Math.round(domContentLoadedMs),
      loadEventMs: loadEventMs === null ? null : Math.round(loadEventMs),
      rscCount: rsc.length,
      rscTotalDurationMs: Math.round(rscDurations.reduce((a, b) => a + b, 0)),
      rscMaxDurationMs: Math.round(rscDurations.reduce((a, b) => Math.max(a, b), 0)),
      rscTotalTransferBytes: rsc.reduce((a, b) => a + b.transferSize, 0),
      rscMaxTtfbMs: Math.round(rscTtfbs.reduce((a, b) => Math.max(a, b), 0)),
      resources: rsc.slice(0, 8).map((r) => ({
        name: r.name,
        duration: Math.round(r.duration),
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        ttfb: Math.round(r.ttfb),
      })),
    };
  }, fullNavigation);
}

async function measureFullGoto(page: Page, url: string, ready: () => Promise<void>): Promise<Sample> {
  await clearPerf(page);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  return collectSample(page, true);
}

async function measureClickNav(page: Page, click: () => Promise<void>, ready: () => Promise<void>): Promise<Sample> {
  await clearPerf(page);
  await click();
  await ready();
  await page.waitForTimeout(100);
  return collectSample(page, false);
}

async function expectTabSelected(page: Page, tabName: string) {
  const tab = page.getByRole('tab', { name: tabName });
  await expect(tab).toBeVisible({ timeout: 30_000 });
  await expect(tab).toBeEnabled();
  // Radix: data-state=active; also aria-selected=true
  await expect
    .poll(async () => {
      const state = await tab.getAttribute('data-state');
      const aria = await tab.getAttribute('aria-selected');
      return state === 'active' || aria === 'true';
    }, { timeout: 30_000 })
    .toBe(true);
}

/** Wait until project tab soft-nav interceptors are attached (after SSR chrome). */
async function expectProjectTabsInteractive(page: Page) {
  await expect
    .poll(async () => page.locator('[data-pf-project-tabs][data-pf-tabs-ready]').count(), {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

async function clickMainNav(page: Page, name: string) {
  await clickNavLink(page, name);
}

test.describe.configure({ mode: 'serial', retries: 0 });

test('production navigation performance verification', async ({ page }) => {
  test.setTimeout(420_000);
  const world = loadWorld();
  const seededProjectName = 'שיפוץ דירה ברמת גן';
  const results: FlowResult[] = [];
  const base = {
    mode: 'PRODUCTION' as const,
    measuredAt: new Date().toISOString(),
    primaryMetric: 'wallMs - click/goto until content ready (UX)',
    classificationBands: {
      FAST: '<500ms repeated',
      ACCEPTABLE: '500–1000ms',
      NOTICEABLE: '1000–2000ms',
      SLOW: '>2000ms',
    },
    note: 'DEV timings are not used. App via next build + next start (Playwright webServer).',
  };

  const push = (r: FlowResult) => {
    results.push(r);
    persist({ ...base, results });
    console.log(
      `[perf] ${r.flow} first=${r.firstMs}ms repeated=${r.repeatedMs ?? '-'}ms ${r.classification}` +
        (r.note ? ` | ${r.note}` : ''),
    );
  };

  // --- A. Initial authenticated dashboard ---
  const loginFirst = await measureFullGoto(page, '/he-IL', async () => {
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible({
      timeout: 60_000,
    });
  });
  push({
    flow: 'A. Login/authenticated → Dashboard',
    firstMs: loginFirst.wallMs,
    repeatedMs: null,
    classification: classify(loginFirst.wallMs, true),
    first: loginFirst,
    repeated: null,
    note: `nav=${loginFirst.navDurationMs}ms ttfb=${loginFirst.ttfbMs}ms dcl=${loginFirst.domContentLoadedMs}ms`,
  });

  const dashWarm = await measureFullGoto(page, '/he-IL', async () => {
    await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
  });
  push({
    flow: 'A2. Dashboard document reload (warm)',
    firstMs: loginFirst.wallMs,
    repeatedMs: dashWarm.wallMs,
    classification: classify(dashWarm.wallMs),
    first: loginFirst,
    repeated: dashWarm,
    note: `ttfb=${dashWarm.ttfbMs}ms nav=${dashWarm.navDurationMs}ms`,
  });

  // --- B. Dashboard → Projects ---
  const projectsFirst = await measureClickNav(
    page,
    async () => clickMainNav(page, he.nav.projects),
    async () => {
      await expect(page).toHaveURL(/\/he-IL\/projects\/?$/);
      await expect(page.getByText(seededProjectName).first()).toBeVisible({ timeout: 30_000 });
    },
  );
  await page.goto('/he-IL');
  await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
  const projectsRepeat = await measureClickNav(
    page,
    async () => clickMainNav(page, he.nav.projects),
    async () => {
      await expect(page.getByText(seededProjectName).first()).toBeVisible();
    },
  );
  push({
    flow: 'B. Dashboard → Projects',
    firstMs: projectsFirst.wallMs,
    repeatedMs: projectsRepeat.wallMs,
    classification: classify(projectsRepeat.wallMs),
    first: projectsFirst,
    repeated: projectsRepeat,
    note: `rscMax=${projectsRepeat.rscMaxDurationMs}ms rscBytes=${projectsRepeat.rscTotalTransferBytes}`,
  });

  // --- C. Open project ---
  const openFirst = await measureClickNav(
    page,
    async () => {
      await page.getByRole('link', { name: new RegExp(seededProjectName) }).first().click();
    },
    async () => {
      await expect(page).toHaveURL(new RegExp(`/he-IL/projects/${world.projectId}`));
      await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible({ timeout: 30_000 });
      await expectTabSelected(page, he.projects.workspace.tabs.overview);
    },
  );
  await page.goto('/he-IL/projects');
  await expect(page.getByText(seededProjectName).first()).toBeVisible();
  // Let list paint + router settle (closer to human list→open) so open-project
  // soft-nav is not measured against a still-hydrating list document.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const openRepeat = await measureClickNav(
    page,
    async () => {
      await page.getByRole('link', { name: new RegExp(seededProjectName) }).first().click();
    },
    async () => {
      await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible();
      await expectTabSelected(page, he.projects.workspace.tabs.overview);
    },
  );
  push({
    flow: 'C. Projects → open project',
    firstMs: openFirst.wallMs,
    repeatedMs: openRepeat.wallMs,
    classification: classify(openRepeat.wallMs),
    first: openFirst,
    repeated: openRepeat,
    note: `rscMax=${openRepeat.rscMaxDurationMs}ms rscBytes=${openRepeat.rscTotalTransferBytes}`,
  });

  async function gotoProjectTab(tabKey: string) {
    const url =
      tabKey === 'overview'
        ? `/he-IL/projects/${world.projectId}`
        : `/he-IL/projects/${world.projectId}?tab=${tabKey}`;
    await page.goto(url);
    await expect(page.getByRole('heading', { name: seededProjectName })).toBeVisible({ timeout: 30_000 });
    await expectProjectTabsInteractive(page);
  }

  // Modules changes/billing/documents are enabled in e2e seed.
  await gotoProjectTab('overview');
  await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.changes })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.billing })).toBeVisible();
  await expect(page.getByRole('tab', { name: he.projects.workspace.tabs.documents })).toBeVisible();

  async function hop(
    flow: string,
    fromKey: string,
    fromLabel: string,
    toKey: string,
    toLabel: string,
    readyExtra?: () => Promise<void>,
  ) {
    await gotoProjectTab(fromKey);
    await expectTabSelected(page, fromLabel);

    const first = await measureClickNav(
      page,
      async () => {
        await page.getByRole('tab', { name: toLabel }).click();
      },
      async () => {
        await expectTabSelected(page, toLabel);
        if (readyExtra) await readyExtra();
      },
    );

    await page.getByRole('tab', { name: fromLabel }).click();
    await expectTabSelected(page, fromLabel);

    const repeated = await measureClickNav(
      page,
      async () => {
        await page.getByRole('tab', { name: toLabel }).click();
      },
      async () => {
        await expectTabSelected(page, toLabel);
        if (readyExtra) await readyExtra();
      },
    );

    push({
      flow,
      firstMs: first.wallMs,
      repeatedMs: repeated.wallMs,
      classification: classify(repeated.wallMs),
      first,
      repeated,
      note: `rscMax=${repeated.rscMaxDurationMs}ms rscBytes=${repeated.rscTotalTransferBytes} rscTtfbMax=${repeated.rscMaxTtfbMs}ms`,
    });
  }

  // --- D ---
  await hop(
    'D. Project Overview → Financials',
    'overview',
    he.projects.workspace.tabs.overview,
    'financials',
    he.projects.workspace.tabs.financials,
    async () => {
      await expect(page.getByRole('heading', { name: he.financial.panelTitle, level: 3 })).toBeVisible({
        timeout: 30_000,
      });
    },
  );

  // --- E ---
  await hop(
    'E. Financials → Expenses',
    'financials',
    he.projects.workspace.tabs.financials,
    'expenses',
    he.projects.workspace.tabs.expenses,
    async () => {
      await expect(page.getByText('כבלים וחומרי חשמל').first()).toBeVisible({ timeout: 30_000 });
    },
  );

  // --- F ---
  await hop(
    'F. Expenses → Changes',
    'expenses',
    he.projects.workspace.tabs.expenses,
    'changes',
    he.projects.workspace.tabs.changes,
    async () => {
      await expect(
        page.getByRole('heading', { name: /שינויים|בקשות שינוי/ }).first(),
      ).toBeVisible({ timeout: 30_000 });
    },
  );

  // --- G ---
  await hop(
    'G. Changes → Billing',
    'changes',
    he.projects.workspace.tabs.changes,
    'billing',
    he.projects.workspace.tabs.billing,
    async () => {
      await expect(page.getByText(/אין חיובים|חיובים/).first()).toBeVisible({ timeout: 30_000 });
    },
  );

  // --- H ---
  await hop(
    'H. Project → Documents',
    'overview',
    he.projects.workspace.tabs.overview,
    'documents',
    he.projects.workspace.tabs.documents,
    async () => {
      await expect(page.getByText(/מסמכים|אין מסמכים|לא צורפו/).first()).toBeVisible({
        timeout: 30_000,
      });
    },
  );

  // --- I. Dashboard → Reports ---
  await page.goto('/he-IL');
  await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
  const reportsFirst = await measureClickNav(
    page,
    async () => clickMainNav(page, he.nav.reports),
    async () => {
      await expect(page).toHaveURL(/\/he-IL\/reports/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    },
  );
  await page.goto('/he-IL');
  await expect(page.getByRole('heading', { name: `שלום ${OWNER.displayName}` })).toBeVisible();
  const reportsRepeat = await measureClickNav(
    page,
    async () => clickMainNav(page, he.nav.reports),
    async () => {
      await expect(page).toHaveURL(/\/he-IL\/reports/);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    },
  );
  push({
    flow: 'I. Dashboard → Reports',
    firstMs: reportsFirst.wallMs,
    repeatedMs: reportsRepeat.wallMs,
    classification: classify(reportsRepeat.wallMs),
    first: reportsFirst,
    repeated: reportsRepeat,
    note: `rscMax=${reportsRepeat.rscMaxDurationMs}ms rscBytes=${reportsRepeat.rscTotalTransferBytes}`,
  });

  // --- J. Warm tab cycle ---
  await gotoProjectTab('overview');
  const cycleLabels = [
    he.projects.workspace.tabs.financials,
    he.projects.workspace.tabs.expenses,
    he.projects.workspace.tabs.changes,
    he.projects.workspace.tabs.billing,
    he.projects.workspace.tabs.documents,
    he.projects.workspace.tabs.overview,
  ];
  // prime
  for (const label of cycleLabels) {
    await page.getByRole('tab', { name: label }).click();
    await expectTabSelected(page, label);
  }
  const cycleSamples: Sample[] = [];
  for (const label of [
    he.projects.workspace.tabs.financials,
    he.projects.workspace.tabs.expenses,
    he.projects.workspace.tabs.changes,
    he.projects.workspace.tabs.billing,
    he.projects.workspace.tabs.overview,
  ]) {
    cycleSamples.push(
      await measureClickNav(
        page,
        async () => {
          await page.getByRole('tab', { name: label }).click();
        },
        async () => {
          await expectTabSelected(page, label);
        },
      ),
    );
  }
  const cycleAvg = Math.round(cycleSamples.reduce((a, s) => a + s.wallMs, 0) / cycleSamples.length);
  const cycleMax = Math.max(...cycleSamples.map((s) => s.wallMs));
  push({
    flow: 'J. Repeated project-tab cycle (avg after warm)',
    firstMs: cycleSamples[0]!.wallMs,
    repeatedMs: cycleAvg,
    classification: classify(cycleAvg),
    first: cycleSamples[0]!,
    repeated: { ...cycleSamples[cycleSamples.length - 1]!, wallMs: cycleAvg },
    note: `per-tab: [${cycleSamples.map((s) => s.wallMs).join(', ')}] max=${cycleMax}`,
  });

  // Client chunk check: real Drizzle ORM/schema leak (not loose "postgres" strings).
  // Match Symbol.for("drizzle:entityKind") / schema builders - not incidental text.
  const chunkProbe = await page.evaluate(async () => {
    const scripts = [...document.querySelectorAll('script[src*="/_next/static/chunks/"]')].map(
      (el) => (el as HTMLScriptElement).src,
    );
    const samples: {
      url: string;
      hasDrizzleOrm: boolean;
      hasPostgresDriver: boolean;
      size: number;
      evidence: string[];
    }[] = [];
    for (const src of scripts.slice(0, 40)) {
      try {
        const res = await fetch(src);
        const text = await res.text();
        const evidence: string[] = [];
        if (text.includes('drizzle:entityKind')) evidence.push('drizzle:entityKind');
        if (text.includes('drizzle:hasOwnEntityKind')) evidence.push('drizzle:hasOwnEntityKind');
        if (text.includes('drizzle-orm/postgres')) evidence.push('drizzle-orm/postgres');
        if (text.includes('idle_timeout') && text.includes('connect_timeout')) {
          evidence.push('postgres-driver-pool-opts');
        }
        const hasDrizzleOrm =
          evidence.includes('drizzle:entityKind') || evidence.includes('drizzle:hasOwnEntityKind');
        const hasPostgresDriver =
          evidence.includes('drizzle-orm/postgres') ||
          evidence.includes('postgres-driver-pool-opts');
        if (hasDrizzleOrm || hasPostgresDriver) {
          samples.push({
            url: src.split('/').pop() ?? src,
            hasDrizzleOrm,
            hasPostgresDriver,
            size: text.length,
            evidence,
          });
        }
      } catch {
        /* ignore */
      }
    }
    return { scriptCount: scripts.length, drizzleRelated: samples };
  });

  const productionCues = await page.evaluate(() => {
    const scripts = [...document.scripts].map((s) => s.src);
    return {
      hasNextStatic: scripts.some((s) => s.includes('/_next/static/')),
      hasWebpackHmr: scripts.some((s) => s.includes('webpack-hmr') || s.includes('hot-update')),
    };
  });

  persist({
    ...base,
    productionCues,
    chunkProbe,
    results,
  });

  console.log('\n=== PERF VERIFICATION SUMMARY ===');
  for (const r of results) {
    console.log(`${r.flow} | first=${r.firstMs} | repeated=${r.repeatedMs ?? '-'} | ${r.classification}`);
  }
  console.log('Wrote', outPath());
  console.log('productionCues', productionCues);
  console.log('drizzleChunks', chunkProbe);

  expect(productionCues.hasNextStatic).toBeTruthy();
  expect(productionCues.hasWebpackHmr).toBeFalsy();
});
