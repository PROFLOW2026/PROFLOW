import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { E2E_SINGLE_EMPLOYEE } from '../harness/config';

export const MARKETING_CAPTURE_LOCALES = ['he-IL', 'en', 'ar', 'ru'] as const;
export type MarketingCaptureLocale = (typeof MARKETING_CAPTURE_LOCALES)[number];

/** E2E seed project display name (same across locales). */
export const MARKETING_SEED_PROJECT_NAME = 'שיפוץ דירה ברמת גן';

const LOCALE_DIR: Record<MarketingCaptureLocale, string> = {
  'he-IL': 'he-IL',
  en: 'en',
  ar: 'ar',
  ru: 'ru',
};

export function marketingScreenshotOutDir(locale: MarketingCaptureLocale): string {
  return join(process.cwd(), 'public', 'marketing', 'screenshots', locale);
}

export function readLocaleJson(locale: MarketingCaptureLocale, file: string): Record<string, unknown> {
  const dir = LOCALE_DIR[locale];
  const raw = readFileSync(join(process.cwd(), 'src', 'locales', dir, `${file}.json`), 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function pickString(obj: Record<string, unknown>, path: string[]): string {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== 'object') throw new Error(`Missing locale path: ${path.join('.')}`);
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur !== 'string') throw new Error(`Expected string at ${path.join('.')}`);
  return cur;
}

export function localeCaptureLabels(locale: MarketingCaptureLocale) {
  const commandCenter = readLocaleJson(locale, 'commandCenter');
  const changes = readLocaleJson(locale, 'changes');
  const billing = readLocaleJson(locale, 'billing');
  const crm = readLocaleJson(locale, 'crm');
  const quotes = readLocaleJson(locale, 'quotes');
  const reports = readLocaleJson(locale, 'reports');
  const documents = readLocaleJson(locale, 'documents');
  const projects = readLocaleJson(locale, 'projects');
  const tasks = readLocaleJson(locale, 'tasks');
  const dashboard = readLocaleJson(locale, 'dashboard');
  const financial = readLocaleJson(locale, 'financial');

  return {
    todayTitle: pickString(commandCenter, ['title']),
    changesTitle: pickString(changes, ['pageTitle']),
    billingTitle: pickString(billing, ['title']),
    crmTitle: pickString(crm, ['title']),
    quotesTitle: pickString(quotes, ['title']),
    reportsTitle: pickString(reports, ['title']),
    invoiceCaptureTitle: pickString(documents, ['ocr', 'title']),
    projectFinancialsTab: pickString(projects, ['workspace', 'tabs', 'financials']),
    workBoardTitle: pickString(tasks, ['board', 'globalPageTitle']),
    recognizedCost: pickString(financial, ['actualCostToDate']),
    attentionTitle: pickString(dashboard, ['attention', 'title']),
  };
}

export async function captureViewportShot(page: Page, outPath: string) {
  mkdirSync(join(outPath, '..'), { recursive: true });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: outPath,
    fullPage: false,
    animations: 'disabled',
  });
}

async function gotoApp(page: Page, href: string) {
  const shell = page.locator('[data-pf-shell="app"]');
  await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await shell.waitFor({ state: 'visible', timeout: 90_000 });
}

/** Direct `/projects/:id` full navigations can hang in Playwright against RSC; list → row link is reliable. */
async function openSeededProjectWorkspace(
  page: Page,
  locale: MarketingCaptureLocale,
  projectId: string,
) {
  await gotoApp(page, `/${locale}/projects`);
  const projectLink = page.getByRole('link', { name: MARKETING_SEED_PROJECT_NAME });
  if (await projectLink.count()) {
    await projectLink.first().click();
  } else {
    await page.getByText(MARKETING_SEED_PROJECT_NAME).first().click();
  }
  await page.waitForURL(new RegExp(`/${locale}/projects/${projectId}`), { timeout: 120_000 });
  const tabs = page.locator('[data-pf-project-tabs]');
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await tabs.isVisible().catch(() => false)) break;
    await page.waitForTimeout(750);
  }
  if (!(await tabs.isVisible().catch(() => false))) {
    await gotoApp(page, `/${locale}/projects/${projectId}`);
  }
  await tabs.waitFor({ timeout: 120_000 });
  await page.locator('main').waitFor({ state: 'visible', timeout: 60_000 });
}

export async function captureMarketingLocaleDesktop(
  page: Page,
  locale: MarketingCaptureLocale,
  projectId: string,
) {
  const labels = localeCaptureLabels(locale);
  const out = marketingScreenshotOutDir(locale);

  async function shot(name: string) {
    await captureViewportShot(page, join(out, name));
  }

  await gotoApp(page, `/${locale}/today`);
  await page.getByRole('heading', { name: labels.todayTitle }).first().waitFor({ timeout: 60_000 });
  await shot('today-desktop.png');

  await gotoApp(page, `/${locale}/`);
  await page.locator('[data-pf-dashboard-home]').waitFor({ timeout: 90_000 });
  await shot('dashboard-desktop.png');

  await openSeededProjectWorkspace(page, locale, projectId);
  await shot('project-overview-desktop.png');

  await gotoApp(page, `/${locale}/projects/${projectId}/financials`);
  await page.getByText(labels.recognizedCost).first().waitFor({ timeout: 60_000 });
  await shot('financials-desktop.png');

  await gotoApp(page, `/${locale}/crm`);
  await page.getByRole('heading', { name: labels.crmTitle }).first().waitFor({ timeout: 60_000 });
  await shot('crm-desktop.png');

  await gotoApp(page, `/${locale}/quotes`);
  await page.getByRole('heading', { name: labels.quotesTitle }).first().waitFor({ timeout: 60_000 });
  await shot('quotes-desktop.png');

  await gotoApp(page, `/${locale}/work/board`);
  await page.getByRole('heading', { name: labels.workBoardTitle }).first().waitFor({ timeout: 60_000 });
  await shot('work-board-desktop.png');

  await gotoApp(page, `/${locale}/documents/ocr-review`);
  await page.getByRole('heading', { name: labels.invoiceCaptureTitle }).first().waitFor({ timeout: 60_000 });
  await shot('invoice-capture-desktop.png');

  await gotoApp(page, `/${locale}/changes`);
  await page.getByRole('heading', { name: labels.changesTitle }).first().waitFor({ timeout: 60_000 });
  await shot('changes-desktop.png');

  await gotoApp(page, `/${locale}/billing`);
  await page.getByRole('heading', { name: labels.billingTitle }).first().waitFor({ timeout: 60_000 });
  await shot('billing-desktop.png');

  await gotoApp(page, `/${locale}/reports`);
  await page.getByRole('heading', { name: labels.reportsTitle }).first().waitFor({ timeout: 60_000 });
  await shot('reports-desktop.png');
}

export async function captureMarketingLocaleMobileToday(page: Page, locale: MarketingCaptureLocale) {
  const labels = localeCaptureLabels(locale);
  const out = marketingScreenshotOutDir(locale);
  await gotoApp(page, `/${locale}/today`);
  await page.getByRole('heading', { name: labels.todayTitle }).first().waitFor({ timeout: 60_000 });
  await captureViewportShot(page, join(out, 'today-mobile.png'));
}

export async function captureEmployeeAppMobile(page: Page, locale: MarketingCaptureLocale) {
  const employeeApp = readLocaleJson(locale, 'employeeApp') as {
    login: { submit: string };
  };
  const out = marketingScreenshotOutDir(locale);
  await page.goto(`/${locale}/employee/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#username').fill(E2E_SINGLE_EMPLOYEE.username);
  await page.locator('#pin').fill(E2E_SINGLE_EMPLOYEE.pin);
  await page.getByRole('button', { name: employeeApp.login.submit }).click();
  await page.locator('[data-pf-employee-app]').waitFor({ timeout: 60_000 });
  await page.getByRole('navigation').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  await captureViewportShot(page, join(out, 'employee-app-mobile.png'));
}
