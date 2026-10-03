/**
 * One authenticated browser smoke against the already-built app.
 * Reads the harness world written by tests/e2e/harness/seed.ts.
 */
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
const password = 'projectflow-e2e-pass';
const world = JSON.parse(readFileSync(new URL('../.world.json', import.meta.url), 'utf8'));
const money = ['246810', '246,810', '246.810'];

function fail(step, detail) {
  const error = new Error(`${step}: ${detail}`);
  error.step = step;
  throw error;
}

async function bodyText(page) {
  return page.locator('body').innerText({ timeout: 20_000 });
}

async function open(page, path, options = {}) {
  const response = await page.goto(`${base}${path}`, { waitUntil: 'commit', timeout: 90_000 });
  await page.locator('body').waitFor({ state: 'visible', timeout: 60_000 });
  const status = response?.status() ?? 0;
  const text = await bodyText(page);
  const dir = await page.locator('html').getAttribute('dir');
  const serverError = status >= 500 || /Internal Server Error|Application error/i.test(text);
  const missing = status === 0 || (status >= 400 && status < 500);
  if (serverError || (missing && !options.allowMissing)) {
    fail(path, `status ${status}\n${text.slice(0, 500)}`);
  }
  return { status, dir, text, url: page.url() };
}

async function ownerLogin(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/he-IL/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('#sign-in-email').fill('gc@e2e.test');
  await page.locator('#sign-in-password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 45_000 });
}

async function employeeLogin(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/he-IL/employee/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').fill(world.gcOpsUsername);
  await page.locator('#pin').fill('135790');
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 45_000 });
}

async function contractorLogin(page) {
  await page.goto(`${base}/he-IL/contractor/sign-in`, { waitUntil: 'domcontentloaded' });
  const user = page.locator('#contractor-username');
  const target = (await user.locator('input').count()) > 0 ? user.locator('input') : user;
  await target.fill(world.gcContractorUsername);
  const pass = page.locator('#contractor-password');
  const passTarget = (await pass.locator('input').count()) > 0 ? pass.locator('input') : pass;
  await passTarget.fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 45_000 });
}

const project = world.gcProjectId;
const agreement = world.gcAgreementId;
const results = [];

function record(name, extra) {
  results.push({ name, ...extra });
  console.log('PASS', name);
}

const browser = await chromium.launch();
try {
  const owner = await browser.newContext({ locale: 'he-IL' });
  const ownerPage = await owner.newPage();
  await ownerLogin(ownerPage);
  record('owner.login', { url: ownerPage.url() });

  const ownerPages = [
    [`/he-IL/projects/${project}`, 'owner.project'],
    [`/he-IL/projects/${project}/contractors/${agreement}`, 'owner.contractor360'],
    [`/he-IL/projects/${project}/claims?new=1`, 'owner.claimCreate'],
    [`/he-IL/projects/${project}/coordination`, 'owner.coordination'],
    [`/he-IL/projects/${project}/plans`, 'owner.plans'],
    [`/he-IL/projects/${project}?tab=documents`, 'owner.documents'],
  ];
  for (const [path, name] of ownerPages) {
    const view = await open(ownerPage, path);
    if (name === 'owner.claimCreate' && !(await ownerPage.locator('#new-claim').count())) {
      fail(name, 'new claim marker missing');
    }
    record(name, { status: view.status, dir: view.dir, url: view.url });
  }
  const he = await open(ownerPage, `/he-IL/projects/${project}`);
  if (he.dir !== 'rtl') fail('owner.hebrewRtl', `dir=${he.dir}`);
  record('owner.hebrewRtl', { dir: he.dir });
  const ar = await open(ownerPage, `/ar/projects/${project}`);
  if (ar.dir !== 'rtl') fail('owner.arabicRtl', `dir=${ar.dir}`);
  record('owner.arabicRtl', { dir: ar.dir });
  await owner.close();

  const employee = await browser.newContext({ locale: 'he-IL' });
  const employeePage = await employee.newPage();
  await employeeLogin(employeePage);
  record('employee.login', { url: employeePage.url() });
  const workspace = await open(employeePage, `/he-IL/employee/projects/${project}`);
  record('employee.workspace', { status: workspace.status, url: workspace.url });
  const fab = employeePage.locator('[data-pf-quick-create="fab"]');
  await fab.waitFor({ state: 'visible', timeout: 20_000 });
  const createItem = employeePage.getByRole('menuitem', {
    name: /משימה|אירוע תיאום|בקשת מידע|הגשה לאישור|ליקוי|בדיקת איכות|הוראת אתר/,
  });
  let createLabel = '';
  for (let attempt = 0; attempt < 8 && !createLabel; attempt += 1) {
    await fab.click();
    const opened = await createItem
      .first()
      .waitFor({ state: 'visible', timeout: 2_500 })
      .then(() => true)
      .catch(() => false);
    if (opened) createLabel = (await createItem.first().innerText()).trim();
    else await employeePage.keyboard.press('Escape').catch(() => {});
  }
  if (!createLabel) {
    const labels = await employeePage.getByRole('menuitem').allInnerTexts().catch(() => []);
    fail('employee.create', labels.join(' | ') || 'project create action missing');
  }
  record('employee.create', { label: createLabel });
  const moneyPages = [
    `/he-IL/employee/projects/${project}`,
    `/he-IL/employee/projects/${project}/financials`,
    `/he-IL/employee/projects/${project}/cost-control`,
    `/he-IL/employee/projects/${project}/contractors/${agreement}`,
  ];
  for (const path of moneyPages) {
    const view = await open(employeePage, path, { allowMissing: path !== `/he-IL/employee/projects/${project}` });
    const hit = money.find((token) => view.text.includes(token));
    if (hit) fail('employee.noFinancials', `${path} showed ${hit}`);
  }
  record('employee.noFinancials');
  await employee.close();

  const contractor = await browser.newContext({ locale: 'he-IL' });
  const contractorPage = await contractor.newPage();
  await contractorLogin(contractorPage);
  record('contractor.login', { url: contractorPage.url() });
  const portalPages = [
    ['/he-IL/contractor', 'contractor.dashboard'],
    [`/he-IL/contractor/projects/${project}`, 'contractor.milestones'],
    [`/he-IL/contractor/projects/${project}/tasks`, 'contractor.tasks'],
    [`/he-IL/contractor/projects/${project}/schedule`, 'contractor.schedule'],
    [`/he-IL/contractor/projects/${project}/claims`, 'contractor.claims'],
    [`/he-IL/contractor/projects/${project}/documents`, 'contractor.documents'],
    [`/he-IL/contractor/projects/${project}/plans`, 'contractor.plans'],
    ['/he-IL/contractor/notifications', 'contractor.notifications'],
  ];
  for (const [path, name] of portalPages) {
    const view = await open(contractorPage, path);
    if (name === 'contractor.milestones') {
      const visible = await contractorPage
        .getByText('אבן דרך גג')
        .first()
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (!visible) fail(name, (await bodyText(contractorPage)).slice(0, 800));
    }
    record(name, { status: view.status, dir: view.dir });
  }
  const portalHe = await open(contractorPage, '/he-IL/contractor');
  if (portalHe.dir !== 'rtl') fail('contractor.hebrewRtl', portalHe.dir);
  record('contractor.hebrewRtl', { dir: portalHe.dir });
  const portalAr = await open(contractorPage, '/ar/contractor');
  if (portalAr.dir !== 'rtl') fail('contractor.arabicRtl', portalAr.dir);
  record('contractor.arabicRtl', { dir: portalAr.dir });
  await contractor.close();

  const mobile = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobilePage = await mobile.newPage();
  await contractorLogin(mobilePage);
  const mobileView = await open(mobilePage, '/he-IL/contractor');
  if (mobileView.dir !== 'rtl') fail('contractor.mobile', `dir=${mobileView.dir}`);
  record('contractor.mobile', { dir: mobileView.dir, status: mobileView.status });
  await mobile.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
