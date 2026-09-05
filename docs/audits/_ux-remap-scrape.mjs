/**
 * READ-ONLY UX remap scrape — output: docs/audits/_ux-remap-ui-snapshot.json
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: '.env.local' });

const EMAIL = '18eran@gmail.com';
const PASSWORD = process.env.OWNER_AUDIT_PASSWORD;
const BASE = process.env.OWNER_AUDIT_BASE_URL || 'https://proflow-two-bice.vercel.app';
const OUT = resolve('docs/audits/_ux-remap-ui-snapshot.json');

if (!PASSWORD) {
  console.error('Set OWNER_AUDIT_PASSWORD');
  process.exit(1);
}

function clean(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}

async function snapshotPage(page, key, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(1200);
  const h1 = clean(await page.locator('h1').first().innerText().catch(() => ''));
  const headings = (await page.locator('h2, h3').allInnerTexts().catch(() => [])).map(clean);
  const buttons = (await page.locator('button').allInnerTexts().catch(() => [])).map(clean).slice(0, 20);
  const tabs = (await page.locator('[role="tab"]').allInnerTexts().catch(() => [])).map(clean);
  const body = clean(await page.locator('body').innerText()).slice(0, 4000);
  return { key, url: page.url(), h1, headings: headings.slice(0, 40), buttons, tabs, bodyPreview: body };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const result = { generatedAt: new Date().toISOString(), base: BASE, pages: {} };

try {
  await page.goto(`${BASE}/he-IL/sign-in`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const globalPaths = [
    '/he-IL',
    '/he-IL/today',
    '/he-IL/projects',
    '/he-IL/jobs',
    '/he-IL/expenses',
    '/he-IL/expenses/new',
    '/he-IL/reports',
    '/he-IL/reports?section=commercial',
    '/he-IL/reports?section=cost',
    '/he-IL/reports?section=profitability',
    '/he-IL/cash-flow',
    '/he-IL/clients',
    '/he-IL/vendors',
    '/he-IL/subcontracts',
    '/he-IL/workforce/employees',
    '/he-IL/workforce/time',
    '/he-IL/billing',
    '/he-IL/changes',
    '/he-IL/quotes',
    '/he-IL/contracts',
    '/he-IL/procurement',
    '/he-IL/procurement/ap',
    '/he-IL/procurement/materials',
    '/he-IL/recurring-drafts',
    '/he-IL/approvals',
    '/he-IL/month-close',
    '/he-IL/documents',
    '/he-IL/field-ops',
    '/he-IL/overhead',
    '/he-IL/settings/business',
    '/he-IL/settings/features',
    '/he-IL/settings/cost-categories',
    '/he-IL/settings/business-catalogs',
    '/he-IL/settings/people',
    '/he-IL/settings/app',
  ];

  for (const p of globalPaths) {
    const snap = await snapshotPage(page, p, `${BASE}${p}`);
    result.pages[p] = snap;
  }

  await page.goto(`${BASE}/he-IL/projects`, { waitUntil: 'networkidle', timeout: 60000 });
  const projHref = await page
    .locator('a[href*="/projects/"]:not([href*="/new"])')
    .first()
    .getAttribute('href')
    .catch(() => null);
  let projectId = null;
  if (projHref) {
    const m = projHref.match(/projects\/([^/?]+)/);
    projectId = m ? m[1] : null;
  }

  if (projectId) {
    const projectTabs = [
      'overview',
      'financials',
      'expenses',
      'changes',
      'boq',
      'billing',
      'billingPlan',
      'budgets',
      'team',
      'time',
      'schedule',
      'work',
      'documents',
      'usage',
      'closeout',
      'warranty',
      'details',
    ];
    for (const tab of projectTabs) {
      const key = `project:${tab}`;
      const snap = await snapshotPage(
        page,
        key,
        `${BASE}/he-IL/projects/${projectId}?tab=${tab}`,
      );
      result.pages[key] = snap;
    }
  }

  await page.goto(`${BASE}/he-IL/expenses`, { waitUntil: 'networkidle', timeout: 60000 });
  const expHref = await page
    .locator('a[href*="/expenses/"]:not([href*="/new"])')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (expHref) {
    const snap = await snapshotPage(
      page,
      'expenseDetail',
      expHref.startsWith('http') ? expHref : `${BASE}${expHref}`,
    );
    result.pages['expenseDetail'] = snap;
  }

  await page.goto(`${BASE}/he-IL/clients`, { waitUntil: 'networkidle', timeout: 60000 });
  const clientHref = await page
    .locator('a[href*="/clients/"]:not([href*="/new"])')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (clientHref) {
    const snap = await snapshotPage(
      page,
      'clientDetail',
      clientHref.startsWith('http') ? clientHref : `${BASE}${clientHref}`,
    );
    result.pages['clientDetail'] = snap;
  }

  await page.goto(`${BASE}/he-IL/vendors`, { waitUntil: 'networkidle', timeout: 60000 });
  const vendorHref = await page
    .locator('a[href*="/vendors/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (vendorHref) {
    const snap = await snapshotPage(
      page,
      'vendorDetail',
      vendorHref.startsWith('http') ? vendorHref : `${BASE}${vendorHref}`,
    );
    result.pages['vendorDetail'] = snap;
  }

  // Mobile viewport sample
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHome = await snapshotPage(page, 'mobile:home', `${BASE}/he-IL`);
  result.pages['mobile:home'] = mobileHome;
} catch (e) {
  result.error = String(e.message || e);
} finally {
  writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8');
  await browser.close();
  console.log(JSON.stringify({ wrote: OUT, count: Object.keys(result.pages).length, error: result.error }, null, 2));
}
