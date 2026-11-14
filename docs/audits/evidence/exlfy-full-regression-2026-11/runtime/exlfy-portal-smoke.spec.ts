import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Request, type ConsoleMessage } from '@playwright/test';
import {
  E2E_GC_CONTRACTOR,
  E2E_GC_OPS_EMPLOYEE,
  E2E_SINGLE_EMPLOYEE,
  SEED_PASSWORD,
} from '../../../../../tests/e2e/harness/config';
import { loadWorld } from '../../../../../tests/e2e/fixtures/world';

const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const diagnosisDir = path.join(runtimeDir, 'portal-diagnosis');

type OverflowMetrics = {
  scrollWidth: number;
  clientWidth: number;
  viewportWidth: number;
  bodyOverflowX: string;
  htmlOverflowX: string;
  hasHorizontalScroll: boolean;
};

type StepResult = {
  surface: 'employee' | 'contractor';
  step: string;
  status: 'VERIFIED PASS' | 'VERIFIED FAIL' | 'UNVERIFIED';
  classification: 'PRODUCT' | 'HARNESS' | 'ENVIRONMENT' | 'UNVERIFIED';
  evidence: string;
  note?: string;
};

const stepResults: StepResult[] = [];

function ensureDiagnosisDir(): void {
  mkdirSync(diagnosisDir, { recursive: true });
}

function record(result: StepResult): void {
  stepResults.push(result);
  writeFileSync(path.join(diagnosisDir, 'steps.json'), JSON.stringify(stepResults, null, 2), 'utf8');
}

async function measureOverflow(page: Page): Promise<OverflowMetrics> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scrollWidth = root.scrollWidth;
    const clientWidth = root.clientWidth;
    return {
      scrollWidth,
      clientWidth,
      viewportWidth: window.innerWidth,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      htmlOverflowX: getComputedStyle(root).overflowX,
      hasHorizontalScroll: scrollWidth > clientWidth + 1,
    };
  });
}

/**
 * Portal shells intentionally set html/body overflow-x: clip|hidden to clip
 * horizontal bleed while using document scroll (globals.css). Real overflow is
 * scrollWidth vs clientWidth — do not fail merely because clip is present.
 */
async function assertNoRealHorizontalOverflow(page: Page, label: string): Promise<OverflowMetrics> {
  const metrics = await measureOverflow(page);
  writeFileSync(
    path.join(diagnosisDir, `${label.replace(/\s+/g, '-')}-overflow.json`),
    JSON.stringify(metrics, null, 2),
    'utf8',
  );
  expect(
    metrics.scrollWidth,
    `${label} overflow @${metrics.viewportWidth}px: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} htmlOverflowX=${metrics.htmlOverflowX}`,
  ).toBeLessThanOrEqual(metrics.clientWidth + 1);
  return metrics;
}

async function attachDiagnostics(page: Page, prefix: string) {
  const consoleLines: string[] = [];
  const networkLines: string[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    consoleLines.push(`[${msg.type()}] ${msg.text()}`);
  };
  const onRequest = (req: Request) => {
    if (req.resourceType() === 'document' || req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
      networkLines.push(`>> ${req.method()} ${req.url()}`);
    }
  };
  const onResponse = async (res: import('@playwright/test').Response) => {
    const req = res.request();
    if (req.resourceType() === 'document' || req.resourceType() === 'fetch' || req.resourceType() === 'xhr') {
      networkLines.push(`<< ${res.status()} ${req.method()} ${res.url()}`);
    }
  };
  page.on('console', onConsole);
  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    async flush(extra?: Record<string, unknown>) {
      page.off('console', onConsole);
      page.off('request', onRequest);
      page.off('response', onResponse);
      writeFileSync(path.join(diagnosisDir, `${prefix}-console.txt`), consoleLines.join('\n'), 'utf8');
      writeFileSync(path.join(diagnosisDir, `${prefix}-network.txt`), networkLines.join('\n'), 'utf8');
      if (extra) {
        writeFileSync(path.join(diagnosisDir, `${prefix}-extra.json`), JSON.stringify(extra, null, 2), 'utf8');
      }
      await page.screenshot({ path: path.join(diagnosisDir, `${prefix}.png`), fullPage: true });
    },
  };
}

async function contractorSignIn(page: Page): Promise<void> {
  await page.goto('/he-IL/contractor/sign-in', { waitUntil: 'domcontentloaded' });
  const user = page.locator('#contractor-username');
  const target = (await user.locator('input').count()) > 0 ? user.locator('input') : user;
  await target.fill(E2E_GC_CONTRACTOR.username);
  const pass = page.locator('#contractor-password');
  const passTarget = (await pass.locator('input').count()) > 0 ? pass.locator('input') : pass;
  await passTarget.fill(SEED_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 90_000 });
}

async function employeeSignInAttempt(
  page: Page,
  username: string,
  pin: string,
  timeoutMs = 45_000,
): Promise<void> {
  await page.goto('/he-IL/employee/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(username);
  await page.locator('#pin').fill(pin);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: timeoutMs });
}

/**
 * Prefer GC ops employee (parity with contractor GC project). On auth failure,
 * retry with E2E_SINGLE_EMPLOYEE to distinguish ops wiring vs employee app breakage.
 */
async function employeeSignIn(
  page: Page,
): Promise<{ usernameUsed: string; pinUsed: string; fallbackUsed: boolean }> {
  const world = loadWorld();
  const primaryUser = world.gcOpsUsername ?? E2E_GC_OPS_EMPLOYEE.username;
  const primaryPin = E2E_GC_OPS_EMPLOYEE.pin;
  try {
    await employeeSignInAttempt(page, primaryUser, primaryPin, 60_000);
    return { usernameUsed: primaryUser, pinUsed: primaryPin, fallbackUsed: false };
  } catch (primaryError) {
    await page.context().clearCookies();
    try {
      await employeeSignInAttempt(page, E2E_SINGLE_EMPLOYEE.username, E2E_SINGLE_EMPLOYEE.pin, 60_000);
      writeFileSync(
        path.join(diagnosisDir, 'employee-login-fallback.json'),
        JSON.stringify(
          {
            primaryFailed: primaryError instanceof Error ? primaryError.message : String(primaryError),
            fallback: E2E_SINGLE_EMPLOYEE.username,
            note: 'ops employee failed; single-org seed login succeeded → ops/harness wiring, not whole employee app',
          },
          null,
          2,
        ),
        'utf8',
      );
      return {
        usernameUsed: E2E_SINGLE_EMPLOYEE.username,
        pinUsed: E2E_SINGLE_EMPLOYEE.pin,
        fallbackUsed: true,
      };
    } catch (fallbackError) {
      writeFileSync(
        path.join(diagnosisDir, 'employee-login-fallback.json'),
        JSON.stringify(
          {
            primaryFailed: primaryError instanceof Error ? primaryError.message : String(primaryError),
            fallbackFailed:
              fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          },
          null,
          2,
        ),
        'utf8',
      );
      throw primaryError;
    }
  }
}

async function visitAndClassify(
  page: Page,
  surface: 'employee' | 'contractor',
  step: string,
  urlPath: string,
  evidencePrefix: string,
): Promise<void> {
  const diag = await attachDiagnostics(page, evidencePrefix);
  try {
    const response = await page.goto(urlPath, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    const overflow = await measureOverflow(page);
    await diag.flush({ status, finalUrl, overflow });
    const ok =
      status > 0 &&
      status < 500 &&
      !finalUrl.includes('/login') &&
      !finalUrl.includes('/sign-in') &&
      !overflow.hasHorizontalScroll;
    record({
      surface,
      step,
      status: ok ? 'VERIFIED PASS' : 'VERIFIED FAIL',
      classification: ok ? 'PRODUCT' : status >= 500 ? 'ENVIRONMENT' : 'PRODUCT',
      evidence: `portal-diagnosis/${evidencePrefix}.png`,
      note: `http=${status} url=${finalUrl} scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} htmlOverflowX=${overflow.htmlOverflowX}`,
    });
    expect(status, `${step} http`).toBeLessThan(500);
    expect(finalUrl, `${step} stayed authenticated`).not.toMatch(/\/(login|sign-in)/);
  } catch (error) {
    await diag.flush({ error: error instanceof Error ? error.message : String(error) }).catch(() => {});
    record({
      surface,
      step,
      status: 'VERIFIED FAIL',
      classification: 'UNVERIFIED',
      evidence: `portal-diagnosis/${evidencePrefix}.png`,
      note: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

test.describe('EXLFY portal smoke (390)', () => {
  test.beforeAll(() => {
    ensureDiagnosisDir();
  });

  test('contractor portal signs in and exercises shell routes', async ({ page }) => {
    const world = loadWorld();
    const diag = await attachDiagnostics(page, 'contractor-login');
    let loginOk = false;
    try {
      await contractorSignIn(page);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const metrics = await assertNoRealHorizontalOverflow(page, 'contractor home');
      await diag.flush({
        url: page.url(),
        dir: await page.locator('html').getAttribute('dir'),
        overflow: metrics,
        world: { gcProjectId: world.gcProjectId, gcContractorUsername: world.gcContractorUsername },
      });
      loginOk = true;
      record({
        surface: 'contractor',
        step: 'sign-in + RTL shell',
        status: 'VERIFIED PASS',
        classification: 'PRODUCT',
        evidence: 'portal-diagnosis/contractor-login.png',
        note: `htmlOverflowX=${metrics.htmlOverflowX} (intentional clip OK); scrollWidth=${metrics.scrollWidth}<=${metrics.clientWidth}`,
      });
      // Prior harness asserted against overflow-x:hidden/clip on html — false positive for portal CSS.
      record({
        surface: 'contractor',
        step: 'overflow assert (scrollWidth vs clientWidth)',
        status: metrics.hasHorizontalScroll ? 'VERIFIED FAIL' : 'VERIFIED PASS',
        classification: metrics.hasHorizontalScroll ? 'PRODUCT' : 'HARNESS',
        evidence: 'portal-diagnosis/contractor-home-overflow.json',
        note: metrics.hasHorizontalScroll
          ? 'Real horizontal scroll detected'
          : 'Prior FAIL was html overflow-x clip/hidden guard; no real scrollWidth overflow',
      });
    } catch (error) {
      const metrics = await measureOverflow(page).catch(() => null);
      await diag.flush({
        error: error instanceof Error ? error.message : String(error),
        url: page.url(),
        overflow: metrics,
      });
      record({
        surface: 'contractor',
        step: 'sign-in + RTL shell',
        status: 'VERIFIED FAIL',
        classification: error instanceof Error && /overflow/i.test(error.message) ? 'HARNESS' : 'PRODUCT',
        evidence: 'portal-diagnosis/contractor-login.png',
        note: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!loginOk) return;
    const projectId = world.gcProjectId;
    await visitAndClassify(page, 'contractor', 'projects home', '/he-IL/contractor', 'contractor-projects');
    if (projectId) {
      await visitAndClassify(
        page,
        'contractor',
        'project tasks',
        `/he-IL/contractor/projects/${projectId}/tasks`,
        'contractor-tasks',
      );
      await visitAndClassify(
        page,
        'contractor',
        'documents',
        `/he-IL/contractor/projects/${projectId}/documents`,
        'contractor-documents',
      );
      await visitAndClassify(
        page,
        'contractor',
        'plans',
        `/he-IL/contractor/projects/${projectId}/plans`,
        'contractor-plans',
      );
    } else {
      record({
        surface: 'contractor',
        step: 'project-scoped routes',
        status: 'UNVERIFIED',
        classification: 'ENVIRONMENT',
        evidence: 'portal-diagnosis/steps.json',
        note: 'gcProjectId missing from world.json',
      });
    }
    await visitAndClassify(
      page,
      'contractor',
      'notifications',
      '/he-IL/contractor/notifications',
      'contractor-notifications',
    );
  });

  test('employee app signs in and exercises shell routes', async ({ page }) => {
    const world = loadWorld();
    const diag = await attachDiagnostics(page, 'employee-login');
    let loginOk = false;
    let usernameUsed = E2E_GC_OPS_EMPLOYEE.username;
    try {
      const creds = await employeeSignIn(page);
      usernameUsed = creds.usernameUsed;
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      const metrics = await assertNoRealHorizontalOverflow(page, 'employee home');
      await diag.flush({
        url: page.url(),
        dir: await page.locator('html').getAttribute('dir'),
        overflow: metrics,
        creds: { usernameUsed, pinLength: creds.pinUsed.length, worldGcOps: world.gcOpsUsername },
      });
      loginOk = true;
      record({
        surface: 'employee',
        step: 'sign-in + RTL shell',
        status: 'VERIFIED PASS',
        classification: creds.fallbackUsed ? 'HARNESS' : 'PRODUCT',
        evidence: 'portal-diagnosis/employee-login.png',
        note: `username=${usernameUsed} pinLen=${creds.pinUsed.length} fallbackUsed=${creds.fallbackUsed}`,
      });
      if (creds.fallbackUsed) {
        record({
          surface: 'employee',
          step: 'ops employee primary login',
          status: 'VERIFIED FAIL',
          classification: 'HARNESS',
          evidence: 'portal-diagnosis/employee-login-fallback.json',
          note: 'GC ops login failed; single-org seed succeeded',
        });
      }
    } catch (error) {
      const alertText = await page
        .locator('[role="alert"], [data-pf-form-error], .text-danger, form')
        .first()
        .innerText()
        .catch(() => '');
      const bodySnippet = await page.locator('body').innerText().catch(() => '');
      await diag.flush({
        error: error instanceof Error ? error.message : String(error),
        url: page.url(),
        usernameUsed,
        worldGcOps: world.gcOpsUsername,
        configUsername: E2E_GC_OPS_EMPLOYEE.username,
        configPin: E2E_GC_OPS_EMPLOYEE.pin,
        alertText: alertText.slice(0, 500),
        bodySnippet: bodySnippet.slice(0, 800),
      });
      const msg = error instanceof Error ? error.message : String(error);
      const looksAuth =
        /authentication_required|login|Timeout/i.test(msg) || page.url().includes('/login');
      record({
        surface: 'employee',
        step: 'sign-in + RTL shell',
        status: 'VERIFIED FAIL',
        classification: looksAuth ? 'HARNESS' : 'PRODUCT',
        evidence: 'portal-diagnosis/employee-login.png',
        note: `${msg}; alert=${alertText.slice(0, 200)}`,
      });
      throw error;
    }

    if (!loginOk) return;
    const projectId = world.gcProjectId;
    await visitAndClassify(page, 'employee', 'projects list', '/he-IL/employee', 'employee-projects');
    if (projectId) {
      await visitAndClassify(
        page,
        'employee',
        'project workspace',
        `/he-IL/employee/projects/${projectId}`,
        'employee-project',
      );
      await visitAndClassify(
        page,
        'employee',
        'tasks / work',
        `/he-IL/employee/projects/${projectId}`,
        'employee-tasks',
      );
      await visitAndClassify(
        page,
        'employee',
        'documents',
        `/he-IL/employee/projects/${projectId}?tab=documents`,
        'employee-documents',
      );
      await visitAndClassify(
        page,
        'employee',
        'plans',
        `/he-IL/employee/projects/${projectId}/plans`,
        'employee-plans',
      );
    } else {
      record({
        surface: 'employee',
        step: 'project-scoped routes',
        status: 'UNVERIFIED',
        classification: 'ENVIRONMENT',
        evidence: 'portal-diagnosis/steps.json',
        note: 'gcProjectId missing from world.json',
      });
    }
    await visitAndClassify(
      page,
      'employee',
      'notifications',
      '/he-IL/employee/notifications',
      'employee-notifications',
    );
  });
});
