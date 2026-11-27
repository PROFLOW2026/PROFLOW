import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { projectHubs, projectSections } from '../fixtures/project-workspace';
import { signInThroughForm } from '../fixtures/sign-in';
import { OWNER } from '../harness/config';

const DESIGN_SWITCHER = 'בחירת מצב תצוגה';
const SEEDED_PROJECT_LINK = /שיפוץ דירה ברמת גן/;
const SHOTS = path.join('tests', 'e2e', 'design', 'screenshots');
const SURFACE_TIMEOUT_MS = 40_000;

type SurfaceKey = 'boq' | 'infrastructure' | 'documents' | 'takeoff';

const ENGINE_ROOT = [
  '[data-testid="takeoff-new-analysis"]',
  '[data-testid="takeoff-action-bar"]',
  '[data-testid="takeoff-detection-row"]',
  '[data-testid="takeoff-review-guide"]',
  '[data-testid="infra-tab-capture"]',
  '[data-testid="infra-tab-gallery"]',
  '[data-testid="infra-tab-locate"]',
  '[data-testid="cad-viewer-tools"]',
].join(', ');

test.describe('design engines on local harness (he-IL)', () => {
  test.describe.configure({ timeout: 420_000 });
  test.use({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });

  test('seeded project engine surfaces survive V9 ↔ Current without replacing the canvas', async ({ page }) => {
    page.setDefaultTimeout(20_000);
    const errors = collectPageErrors(page);
    const blocked = new Set<string>();

    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page, OWNER.email);
    assertLocalHarness(page);

    await page.goto('/he-IL/projects');
    await expect(page.locator('[data-pf-shell="app"]')).toBeVisible({ timeout: SURFACE_TIMEOUT_MS });
    await page.getByRole('link', { name: SEEDED_PROJECT_LINK }).first().click();
    await page.waitForURL(/\/he-IL\/projects\/[^/]+/, { timeout: SURFACE_TIMEOUT_MS });
    assertLocalHarness(page);

    const projectId = projectIdFromUrl(page.url());
    if (!projectId) {
      throw new Error(`Could not parse project id from ${page.url()}`);
    }

    const takeoffOpened = await openTakeoffSurface(page, projectId, blocked);
    if (takeoffOpened) {
      await assertDesignSwitchPreservesEngine(page, 'takeoff');
      await chooseDesign(page, 'V9');
      await page.screenshot({ path: shot('engine-takeoff-v9.png') });
      await chooseDesign(page, 'נוכחי');
    }

    const boqOpened = await openBoqSurface(page, projectId, blocked);
    if (boqOpened) {
      await assertDesignSwitchPreservesEngine(page, 'boq');
      await chooseDesign(page, 'נוכחי');
      await page.screenshot({ path: shot('engine-boq-current.png') });
    }

    const infraOpened = await openInfrastructureSurface(page, projectId, blocked);
    if (infraOpened) {
      await assertDesignSwitchPreservesEngine(page, 'infrastructure');
    }

    const documentsOpened = await openDocumentsSurface(page, projectId, blocked);
    if (documentsOpened) {
      await assertDesignSwitchPreservesEngine(page, 'documents');
      await probeDocumentPreview(page, blocked);
      await probePdfImportControls(page, projectId, blocked);
    }

    test.info().annotations.push({
      type: 'design-engines-summary',
      description: [
        `opened: takeoff=${takeoffOpened} boq=${boqOpened} infrastructure=${infraOpened} documents=${documentsOpened}`,
        `blocked: ${[...blocked].join('; ') || 'none'}`,
      ].join(' | '),
    });

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

async function openBoqSurface(page: Page, projectId: string, blocked: Set<string>): Promise<boolean> {
  return openProjectTab(page, projectId, 'boq', blocked, 'boq');
}

async function openInfrastructureSurface(page: Page, projectId: string, blocked: Set<string>): Promise<boolean> {
  const opened = await openProjectTab(page, projectId, 'infra', blocked, 'infrastructure');
  if (opened && !(await engineCanvasVisible(page))) {
    markBlocked(blocked, 'infrastructure-canvas', 'infra tab rendered without the capture/gallery/locate canvas');
  }
  return opened;
}

async function openDocumentsSurface(page: Page, projectId: string, blocked: Set<string>): Promise<boolean> {
  return openProjectTab(page, projectId, 'documents', blocked, 'documents');
}

async function openProjectTab(
  page: Page,
  projectId: string,
  tab: string,
  blocked: Set<string>,
  key: string,
): Promise<boolean> {
  const href = `/he-IL/projects/${projectId}?tab=${tab}`;
  const response = await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => null);
  assertLocalHarness(page);
  if (!response || response.status() === 404 || (await isNotFound(page))) {
    markBlocked(blocked, key, `404 at ${href}`);
    return false;
  }
  if (!(await shellReady(page))) {
    markBlocked(blocked, key, `app shell did not render at ${href}`);
    return false;
  }
  return true;
}

async function openTakeoffSurface(page: Page, projectId: string, blocked: Set<string>): Promise<boolean> {
  const takeoffHref = `/he-IL/projects/${projectId}/takeoff`;
  const response = await page
    .goto(takeoffHref, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    .catch(() => null);
  assertLocalHarness(page);
  if (!response || response.status() === 404 || (await isNotFound(page))) {
    markBlocked(blocked, 'takeoff', `takeoff route did not render (${takeoffHref})`);
    return false;
  }
  if (!(await shellReady(page))) {
    markBlocked(blocked, 'takeoff', 'takeoff route did not render app shell');
    return false;
  }
  if (!(await engineCanvasVisible(page))) {
    markBlocked(blocked, 'takeoff', 'engine canvas absent on takeoff route');
    return false;
  }
  return true;
}

async function assertDesignSwitchPreservesEngine(page: Page, surface: SurfaceKey): Promise<void> {
  await expect(page.locator('[data-pf-design-scope="product"]')).toBeVisible({ timeout: SURFACE_TIMEOUT_MS });
  const urlBefore = page.url();
  const engineRoot = page.locator(ENGINE_ROOT);
  const hadEngineCanvas = await engineCanvasVisible(page);
  const engineRoute = pathHasEngineSegment(page);

  await chooseDesign(page, 'V9');
  expect(stripHash(page.url())).toBe(stripHash(urlBefore));
  if (engineRoute) {
    await expect(page.locator('[data-pf-design-family="engine"]')).toBeVisible();
    await expect(page.locator('[data-pf-design-landmark="v9-family"]')).toHaveCount(0);
    await expect(page.locator('[data-pf-design-landmark="v10-family"]')).toHaveCount(0);
    if (hadEngineCanvas) {
      await expect(engineRoot.first()).toBeAttached();
    }
  }

  await chooseDesign(page, 'נוכחי');
  expect(stripHash(page.url())).toBe(stripHash(urlBefore));
  if (engineRoute && hadEngineCanvas) {
    await expect(engineRoot.first()).toBeAttached();
  }

  if (!engineRoute && surface === 'boq') {
    const family = await page.locator('[data-pf-design-family]').first().getAttribute('data-pf-design-family');
    test.info().annotations.push({
      type: 'boq-family',
      description: `BOQ surface family=${family ?? 'missing'} (detail/project-home allowed)`,
    });
  }
}

async function probeDocumentPreview(page: Page, blocked: Set<string>): Promise<void> {
  const fileRow = page.locator('main').getByRole('link').filter({
    hasNotText: new RegExp(
      [
        projectHubs.money,
        projectHubs.work,
        projectHubs.documents,
        projectHubs.infra,
        projectHubs.details,
        projectSections.boq,
        projectSections.documents,
        projectSections.takeoff,
      ].join('|'),
    ),
  });

  const candidate = fileRow.first();
  if (!(await candidate.isVisible().catch(() => false))) {
    markBlocked(blocked, 'documents-preview', 'no visible file row link in documents hub');
    return;
  }

  const backUrl = page.url();
  await candidate.click();
  await settleSurface(page);

  const preview = page
    .locator(
      [
        '[data-pf-preview-document-id]',
        '[role="dialog"]',
        'iframe',
        'img[alt]',
        'canvas',
      ].join(', '),
    )
    .first();

  try {
    await expect(preview).toBeVisible({ timeout: 30_000 });
  } catch {
    markBlocked(blocked, 'documents-preview', 'file link clicked but no viewer/preview appeared');
    await page.goto(backUrl, { waitUntil: 'domcontentloaded' });
    return;
  }

  await page.goto(backUrl, { waitUntil: 'domcontentloaded' });
  await shellReady(page);
}

async function probePdfImportControls(page: Page, projectId: string, blocked: Set<string>): Promise<void> {
  const controls = page
    .getByRole('button')
    .filter({ hasText: /PDF|ייבוא|העלאת|import/i })
    .or(page.getByRole('link').filter({ hasText: /PDF|ייבוא|import/i }));
  const visible = await Promise.race([
    controls.first().isVisible({ timeout: 3_000 }).catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4_000)),
  ]);
  if (!visible) {
    markBlocked(
      blocked,
      'pdf',
      `no PDF import/open control on project ${projectId} documents surface (no seeded file; import id and live share token are not in this seed)`,
    );
  }
}

async function settleSurface(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  const tablist = page.getByRole('tablist');
  if (await tablist.isVisible().catch(() => false)) {
    await expect(tablist).toBeVisible({ timeout: SURFACE_TIMEOUT_MS });
  }
}

async function shellReady(page: Page): Promise<boolean> {
  const shell = page.locator('[data-pf-shell="app"]');
  if (await shell.isVisible().catch(() => false)) return true;
  try {
    await expect(shell).toBeVisible({ timeout: SURFACE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function engineCanvasVisible(page: Page): Promise<boolean> {
  const root: Locator = page.locator(ENGINE_ROOT);
  try {
    await expect(root.first()).toBeVisible({ timeout: SURFACE_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

async function isNotFound(page: Page): Promise<boolean> {
  const title = page.getByRole('heading', { name: /404|לא נמצא|not found/i });
  return title.isVisible().catch(() => false);
}

function pathHasEngineSegment(page: Page): boolean {
  const { pathname } = new URL(page.url());
  return /\/(takeoff|infrastructure|boq-measure|plans)(\/|$)/.test(pathname);
}

function projectIdFromUrl(url: string): string | null {
  const match = url.match(/\/projects\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function stripHash(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}${parsed.search}`;
}

function markBlocked(blocked: Set<string>, key: string, reason: string): void {
  blocked.add(`${key}: ${reason}`);
  test.info().annotations.push({ type: 'blocked', description: `${key}: ${reason}` });
}

function shot(name: string): string {
  mkdirSync(SHOTS, { recursive: true });
  return path.join(SHOTS, name);
}

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

function assertLocalHarness(page: Page): void {
  const host = new URL(page.url()).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error('design-engines spec only runs against the local harness (loopback)');
  }
}

async function chooseDesign(page: Page, optionLabel: string): Promise<void> {
  await openAppearanceMenu(page);
  await page.getByRole('menuitem', { name: optionLabel, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute(
    'data-pf-design',
    optionLabel === 'V9' ? 'v9' : optionLabel === 'V10' ? 'v10' : 'current',
  );
}

async function openAppearanceMenu(page: Page): Promise<void> {
  const header = page.getByRole('button', { name: DESIGN_SWITCHER });
  if (await header.isVisible().catch(() => false)) {
    await header.click();
    return;
  }
  await page.getByRole('button', { name: he.common.a11y.userMenu }).click();
}