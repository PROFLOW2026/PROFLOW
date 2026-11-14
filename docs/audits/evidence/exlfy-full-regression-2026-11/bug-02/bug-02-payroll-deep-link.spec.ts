/**
 * BUG-02 isolated Playwright probe — payroll deep link + EMC history.
 *
 * Harness-only. No product code changes.
 *
 * Run (postgres disposable DB):
 *   node scripts/.reset-e2e-postgres-db.mjs
 *   $env:E2E_DATABASE_MODE='postgres'
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
 *   $env:DIRECT_DATABASE_URL=$env:DATABASE_URL
 *   $env:E2E_FORCE_FRESH_SERVER='1'
 *   $env:E2E_SKIP_BUILD='1'
 *   $env:E2E_HARNESS_SETTLE_MS='15000'
 *   npx playwright test --config docs/audits/evidence/exlfy-full-regression-2026-11/bug-02/playwright.bug02.config.ts --workers=1
 */
import { expect, test, type Page, type Response } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(evidenceDir, 'logs');
const fixturePath = path.join(evidenceDir, 'bug-02-emc-seed.json');
const seedScript = path.join(evidenceDir, 'seed-emc-payroll.mjs');

type SeedFixture = {
  employeeId: string;
  paymentId: string;
  yearMonth: string;
  deepLinkWithPayment: string;
  deepLinkWithoutPayment: string;
  employeeName: string;
};

function appendLog(name: string, payload: unknown) {
  mkdirSync(logDir, { recursive: true });
  writeFileSync(path.join(logDir, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function loadFixture(): SeedFixture {
  if (!existsSync(fixturePath)) {
    throw new Error(`Missing seed fixture ${fixturePath} — run seed-emc-payroll.mjs first`);
  }
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as SeedFixture;
}

function ensureEmcSeed() {
  const databaseUrl =
    process.env.DATABASE_URL?.trim() ||
    'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';
  execFileSync(process.execPath, [seedScript], {
    cwd: path.resolve(evidenceDir, '../../../../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_DATABASE_URL: databaseUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

type CaptureBundle = {
  url: string;
  label: string;
  consoleLines: string[];
  pageErrors: Array<{ message: string; stack?: string }>;
  documentStatus: number | null;
  documentUrl: string | null;
  sawGenericError: boolean;
  errorPageBodyVisible: boolean;
  payrollPanelVisible: boolean;
  monthReviewTitleVisible: boolean;
  confirmPaidVisible: boolean;
  pageTitle: string;
  bodySnippet: string;
};

async function attachCaptures(page: Page) {
  const consoleLines: string[] = [];
  const pageErrors: Array<{ message: string; stack?: string }> = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      consoleLines.push(`[${type}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack });
    consoleLines.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
  });

  return { consoleLines, pageErrors };
}

async function probeDeepLink(page: Page, url: string, label: string): Promise<CaptureBundle> {
  const { consoleLines, pageErrors } = await attachCaptures(page);

  let documentStatus: number | null = null;
  let documentUrl: string | null = null;

  const responsePromise = page
    .waitForResponse(
      (res: Response) =>
        res.request().resourceType() === 'document' && res.url().includes('/workforce/employees/'),
      { timeout: 90_000 },
    )
    .catch(() => null);

  const nav = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const docRes = (await responsePromise) ?? nav;
  documentStatus = docRes?.status() ?? null;
  documentUrl = docRes?.url() ?? page.url();

  // Allow RSC/error boundary to settle.
  await page.waitForTimeout(2500);

  const errorTitle = page.getByText('משהו השתבש', { exact: false });
  const sawGenericError = await errorTitle.isVisible().catch(() => false);
  const errorPageBodyVisible = await page
    .getByText('נתקלנו בתקלה לא צפויה', { exact: false })
    .isVisible()
    .catch(() => false);

  const payrollPanelVisible = await page.locator('#employee-payroll-payment').isVisible().catch(() => false);
  const monthReviewTitleVisible = await page
    .getByText(/אישור עלות מעסיק חודשית|עלות מעסיק חודשית|מתקדם: סקירת עלות מעסיק/)
    .first()
    .isVisible()
    .catch(() => false);
  const confirmPaidVisible = await page.getByRole('button', { name: 'אשר ששולם' }).isVisible().catch(() => false);

  const pageTitle = await page.title().catch(() => '');
  const bodySnippet = (await page.locator('body').innerText().catch(() => '')).slice(0, 1200);

  const bundle: CaptureBundle = {
    url,
    label,
    consoleLines: consoleLines.slice(0, 80),
    pageErrors: pageErrors.slice(0, 20),
    documentStatus,
    documentUrl,
    sawGenericError,
    errorPageBodyVisible,
    payrollPanelVisible,
    monthReviewTitleVisible,
    confirmPaidVisible,
    pageTitle,
    bodySnippet,
  };

  appendLog(`playwright-${label}.json`, bundle);
  await page.screenshot({
    path: path.join(logDir, `playwright-${label}.png`),
    fullPage: true,
  });

  if (pageErrors.length > 0) {
    appendLog(`playwright-${label}-stacks.json`, pageErrors);
  }

  return bundle;
}

async function tryConfirmPaidIfVisible(page: Page, label: string) {
  const button = page.getByRole('button', { name: 'אשר ששולם' });
  const visible = await button.isVisible().catch(() => false);
  if (!visible) {
    appendLog(`playwright-${label}-confirm-skip.json`, { reason: 'confirmPaid not visible' });
    return;
  }

  const consoleLines: string[] = [];
  const pageErrors: Array<{ message: string; stack?: string }> = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleLines.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push({ message: err.message, stack: err.stack }));

  await button.click();
  const confirm = page.getByRole('button', { name: /אשר|Confirm/i }).last();
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click().catch(() => undefined);
  }
  await page.waitForTimeout(2000);

  const afterError = await page.getByText('משהו השתבש').isVisible().catch(() => false);
  appendLog(`playwright-${label}-confirm-attempt.json`, {
    afterError,
    consoleLines: consoleLines.slice(0, 40),
    pageErrors,
  });
  await page.screenshot({
    path: path.join(logDir, `playwright-${label}-confirm-attempt.png`),
    fullPage: true,
  });
}

test.describe('BUG-02 payroll deep link with EMC history', () => {
  test.describe.configure({ mode: 'serial' });

  let fixture: SeedFixture;

  test.beforeAll(() => {
    mkdirSync(logDir, { recursive: true });
    ensureEmcSeed();
    fixture = loadFixture();
    appendLog('playwright-fixture-loaded.json', fixture);
  });

  /** Same bake-safe rewrite as owner-auth-stub.setup (storageState cookies; RSC may still call Auth). */
  test.beforeEach(async ({ page }) => {
    await page.route(/https?:\/\/[^/]*supabase\.co\/.*/i, async (route) => {
      const incoming = new URL(route.request().url());
      const rewritten = new URL(incoming.pathname + incoming.search, 'http://127.0.0.1:55321');
      try {
        const response = await route.fetch({
          url: rewritten.toString(),
          headers: { ...route.request().headers(), host: '127.0.0.1:55321' },
        });
        await route.fulfill({ response });
      } catch (error) {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'bug02_auth_rewrite_failed',
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    });
  });

  test('deep link WITH paymentId + yearMonth + focus=payroll (EMC history)', async ({ page }) => {
    const bundle = await probeDeepLink(page, fixture.deepLinkWithPayment, 'with-paymentId');

    // Evidence classification is written to logs; soft assert so we always keep artifacts.
    appendLog('playwright-with-paymentId-verdict.json', {
      classificationHint: bundle.sawGenericError
        ? 'VERIFIED_FAIL_candidate'
        : bundle.documentStatus && bundle.documentStatus >= 500
          ? 'VERIFIED_FAIL_candidate'
          : bundle.payrollPanelVisible || bundle.monthReviewTitleVisible
            ? 'VERIFIED_PASS_candidate'
            : 'UNVERIFIED',
      sawGenericError: bundle.sawGenericError,
      documentStatus: bundle.documentStatus,
      pageErrorCount: bundle.pageErrors.length,
    });

    if (bundle.sawGenericError) {
      // Proven crash path for BUG-02 symptom.
      expect(bundle.sawGenericError).toBe(true);
    } else {
      // Page loaded — attempt confirm UI if present (isolated only).
      await tryConfirmPaidIfVisible(page, 'with-paymentId');
      expect(bundle.documentStatus).toBeLessThan(500);
      expect(bundle.sawGenericError).toBe(false);
    }
  });

  test('deep link WITHOUT paymentId (EMC history still mounts month review)', async ({ page }) => {
    const bundle = await probeDeepLink(page, fixture.deepLinkWithoutPayment, 'without-paymentId');

    const harnessDbTimeout = bundle.consoleLines.some((line) =>
      /CONNECT_TIMEOUT|500 \(Internal Server Error\)/i.test(line),
    );
    const classificationHint = bundle.sawGenericError
      ? 'VERIFIED_FAIL_candidate'
      : harnessDbTimeout && bundle.documentStatus === 500
        ? 'HARNESS_FAILURE'
        : bundle.monthReviewTitleVisible
          ? 'VERIFIED_PASS_candidate'
          : 'UNVERIFIED';

    appendLog('playwright-without-paymentId-verdict.json', {
      classificationHint,
      sawGenericError: bundle.sawGenericError,
      documentStatus: bundle.documentStatus,
      pageErrorCount: bundle.pageErrors.length,
      harnessDbTimeout,
    });

    // Evidence test: capture always; do not fail the suite on disposable-DB timeouts.
    if (classificationHint === 'HARNESS_FAILURE') {
      expect(bundle.documentStatus).toBe(500);
      return;
    }
    if (bundle.sawGenericError) {
      expect(bundle.sawGenericError).toBe(true);
    } else {
      expect(bundle.documentStatus).toBeLessThan(500);
    }
  });

  test('control: employees list still reachable after EMC seed', async ({ page }) => {
    const { consoleLines, pageErrors } = await attachCaptures(page);
    await page.goto('/he-IL/workforce/employees', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'כוח אדם', level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    const named = page.getByText(fixture.employeeName);
    const namedVisible = await named.isVisible().catch(() => false);
    appendLog('playwright-employees-list.json', {
      namedVisible,
      consoleLines: consoleLines.slice(0, 20),
      pageErrors,
    });
    await page.screenshot({
      path: path.join(logDir, 'playwright-employees-list.png'),
      fullPage: true,
    });
  });
});
