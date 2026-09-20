/**
 * UWM final closeout production smoke — owner + locales + key routes.
 * Usage: APP_URL=https://proflow-two-bice.vercel.app node scripts/.uwm-closeout-smoke.mjs
 */
import { config } from 'dotenv';
import { chromium } from '@playwright/test';
import { signInViaAdminMagicLink } from './lib/e2e-auth.mjs';

config({ path: '.env.local' });

const APP_URL = (process.env.APP_URL ?? 'https://proflow-two-bice.vercel.app').replace(/\/+$/, '');
const OWNER_EMAIL = (process.env.PRODUCTION_OWNER_EMAIL ?? 'leokid2026@gmail.com').trim();

const OWNER_ROUTES = [
  { locale: 'he-IL', path: '/work', expectTitleIncludes: ['משימות', 'My Work'] },
  { locale: 'he-IL', path: '/meetings', expectTitleIncludes: ['ישיבות', 'Meetings'] },
  { locale: 'he-IL', path: '/operations', expectTitleIncludes: ['תפעול', 'Operations'] },
  { locale: 'he-IL', path: '/portfolio', expectTitleIncludes: ['תיק', 'Portfolio'] },
  { locale: 'he-IL', path: '/workload', expectTitleIncludes: ['עומס', 'Workload'] },
  { locale: 'en', path: '/meetings', expectTitleIncludes: ['Meetings'] },
  { locale: 'ar', path: '/meetings', expectTitleIncludes: ['اجتماع', 'Meetings'] },
  { locale: 'ru', path: '/meetings', expectTitleIncludes: ['Совещания', 'Meetings'] },
];

function titleOk(title, expected) {
  return expected.some((part) => title.includes(part));
}

function leakageHe(text) {
  return /\b(Meetings|Operations|Portfolio|Workload|My Work|Create board|Tasks)\b/.test(text);
}

function leakageEn(text) {
  return /[\u0590-\u05FF]/.test(text);
}

/** UI chrome only — exclude dynamic rows (Hebrew demo meeting/project titles are expected). */
async function uiChromeText(page) {
  const header = await page.locator('header, [data-pf-shell="app"] nav, [role="banner"]').first().innerText().catch(() => '');
  const pageHeader = await page.locator('h1, [data-page-header]').first().innerText().catch(() => '');
  return `${header}\n${pageHeader}`;
}

function normalizeAppPath(href) {
  if (!href) return null;
  const path = href.startsWith('http') ? new URL(href).pathname : href;
  return path.replace(/^\/(he-IL|en|ar|ru)(?=\/)/, '');
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

await signInViaAdminMagicLink(context, page, OWNER_EMAIL);

const results = [];

for (const route of OWNER_ROUTES) {
  const url = `${APP_URL}/${route.locale}${route.path}`;
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const title = await page.title();
  const chromeText = await uiChromeText(page);
  const dir = await page.locator('html').getAttribute('dir');
  results.push({
    kind: 'owner-route',
    url,
    status: res?.status() ?? 0,
    titleOk: titleOk(title, route.expectTitleIncludes),
    title,
    dir,
    heLeakage: route.locale === 'he-IL' ? leakageHe(`${title}\n${chromeText}`) : false,
    enLeakage: route.locale === 'en' ? leakageEn(`${title}\n${chromeText}`) : false,
  });
}

// Project task UI — pick a real project (skip /projects/new)
await page.goto(`${APP_URL}/he-IL/projects`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const projectLinks = await page.locator('a[href*="/projects/"]').all();
let projectPath = null;
for (const link of projectLinks) {
  const href = normalizeAppPath(await link.getAttribute('href'));
  if (!href) continue;
  if (href === '/projects/new' || href.endsWith('/projects/new')) continue;
  if (/^\/projects\/[0-9a-f-]{36}$/i.test(href) || /^\/projects\/[^/]+$/.test(href)) {
    projectPath = href;
    break;
  }
}

if (projectPath) {
  const projectTasksUrl = `${APP_URL}/he-IL${projectPath}/tasks`;
  const res = await page.goto(projectTasksUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  results.push({
    kind: 'project-tasks',
    url: projectTasksUrl,
    status: res?.status() ?? 0,
    title: await page.title(),
    has404: (await page.title()).includes('404'),
  });
} else {
  results.push({
    kind: 'project-tasks',
    url: null,
    status: 0,
    title: null,
    has404: true,
    error: 'No real project link found on /projects',
  });
}

console.log(JSON.stringify({ appUrl: APP_URL, results }, null, 2));
await browser.close();

const failed = results.filter(
  (r) => r.status !== 200 || r.has404 || r.titleOk === false || r.heLeakage || r.enLeakage,
);
process.exit(failed.length > 0 ? 1 : 0);
