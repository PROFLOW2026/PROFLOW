/**
 * Consultancy Employee App production closeout smoke.
 * Usage: APP_URL=https://proflow-two-bice.vercel.app node scripts/.uwm-employee-closeout-smoke.mjs
 */
import { chromium } from '@playwright/test';

const APP_URL = (process.env.APP_URL ?? 'https://proflow-two-bice.vercel.app').replace(/\/+$/, '');
const DEMO_PIN = process.env.CONSULTANCY_EMPLOYEE_PIN ?? '747975';

const PROFILES = [
  {
    key: 'fieldWorker',
    username: 'OFEK-DANIEL',
    label: 'Technical professional',
    expectTasksNav: true,
    expectOwnerShellDenied: true,
    expectFinanceDenied: true,
  },
  {
    key: 'professionalEmployee',
    username: 'OFEK-YAEL',
    label: 'Professional engineer',
    expectTasksNav: true,
    expectOwnerShellDenied: true,
    expectFinanceDenied: true,
  },
  {
    key: 'projectManager',
    username: 'OFEK-URI',
    label: 'Management / org-wide',
    expectTasksNav: true,
    expectOwnerShellDenied: true,
    expectFinanceDenied: true,
  },
];

async function employeeLogin(page, username) {
  const loginUrl = `${APP_URL}/he-IL/employee/login?u=${encodeURIComponent(username)}`;
  const res = await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.fill('#username', username);
  await page.fill('#pin', DEMO_PIN);
  await page.getByRole('button', { name: /כניסה|login/i }).click();
  await page.waitForTimeout(3000);
  return { loginUrl, status: res?.status() ?? 0, finalUrl: page.url() };
}

async function smokeProfile(browser, profile) {
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const report = { profile: profile.key, username: profile.username, checks: {} };

  const login = await employeeLogin(page, profile.username);
  report.checks.login =
    /\/employee(?:\/|$)/.test(login.finalUrl) && !/\/login/.test(login.finalUrl) ? 'PASS' : 'FAIL';
  report.loginUrl = login.finalUrl;

  if (report.checks.login !== 'PASS') {
    await context.close();
    return report;
  }

  await page.goto(`${APP_URL}/he-IL/employee`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  report.checks.employeeHome = /\/employee(?:\/|$)/.test(page.url()) ? 'PASS' : 'FAIL';

  const navText = await page.locator('nav, [data-pf-shell="employee"]').first().innerText().catch(() => '');
  report.checks.tasksNav =
    profile.expectTasksNav && /משימות|tasks/i.test(navText) ? 'PASS' : profile.expectTasksNav ? 'FAIL' : 'N/A';

  const tasksRes = await page.goto(`${APP_URL}/he-IL/employee/tasks`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  report.checks.myTasks = tasksRes?.status() === 200 && !page.url().includes('/login') ? 'PASS' : 'FAIL';

  const projectsRes = await page.goto(`${APP_URL}/he-IL/employee/projects`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  report.checks.myProjects = projectsRes?.status() === 200 && !page.url().includes('/login') ? 'PASS' : 'FAIL';

  const ownerRes = await page.goto(`${APP_URL}/he-IL/work`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  const ownerBlocked =
    ownerRes?.status() === 403 ||
    ownerRes?.status() === 404 ||
    page.url().includes('/sign-in') ||
    page.url().includes('/employee') ||
    !(await page.locator('[data-pf-shell="app"]').count());
  report.checks.ownerShellIsolation = profile.expectOwnerShellDenied && ownerBlocked ? 'PASS' : 'FAIL';

  const financeRes = await page.goto(`${APP_URL}/he-IL/finance`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  const financeBlocked =
    financeRes?.status() === 403 ||
    financeRes?.status() === 404 ||
    page.url().includes('/sign-in') ||
    page.url().includes('/employee') ||
    !(await page.locator('[data-pf-shell="app"]').count());
  report.checks.financeIsolation = profile.expectFinanceDenied && financeBlocked ? 'PASS' : 'FAIL';

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/he-IL/employee`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  report.checks.mobileNav = /\/employee(?:\/|$)/.test(page.url()) ? 'PASS' : 'FAIL';

  await context.close();
  return report;
}

const browser = await chromium.launch({ headless: true });
const results = [];
for (const profile of PROFILES) {
  results.push(await smokeProfile(browser, profile));
}
await browser.close();

const failed = results.flatMap((r) =>
  Object.entries(r.checks).filter(([, v]) => v === 'FAIL').map(([k]) => `${r.profile}.${k}`),
);

console.log(JSON.stringify({ appUrl: APP_URL, results, failed }, null, 2));
process.exit(failed.length > 0 ? 1 : 0);
