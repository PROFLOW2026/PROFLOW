/**
 * Focused employee login probe (ops + single) against a running app.
 * Writes portal-diagnosis/employee-probe-*.json evidence.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../../../');
const world = JSON.parse(readFileSync(path.join(repoRoot, 'tests/e2e/.world.json'), 'utf8'));
const base = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100';
mkdirSync(here, { recursive: true });

async function tryLogin(page, username, pin, label) {
  const network = [];
  page.on('response', (res) => {
    const u = res.url();
    if (u.includes('/employee') || u.includes('/auth/')) {
      network.push(`${res.status()} ${res.request().method()} ${u}`);
    }
  });
  await page.goto(`${base}/he-IL/employee/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#username').fill(username);
  await page.locator('#pin').fill(pin);
  await page.locator('form button[type="submit"]').click();
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 120_000 });
  } catch {
    /* capture below */
  }
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      htmlOverflowX: getComputedStyle(root).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    };
  });
  const alertText = await page.locator('[role="alert"]').first().innerText().catch(() => '');
  const out = {
    label,
    username,
    finalUrl: page.url(),
    leftLogin: !page.url().includes('/login'),
    dir: await page.locator('html').getAttribute('dir'),
    hasEmployeeShell: (await page.locator('[data-pf-employee-app]').count()) > 0,
    alertText: alertText.slice(0, 400),
    overflow,
    network: network.slice(0, 40),
  };
  await page.screenshot({ path: path.join(here, `employee-probe-${label}.png`), fullPage: true });
  writeFileSync(path.join(here, `employee-probe-${label}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  return out;
}

const browser = await chromium.launch();
const results = [];
try {
  for (const [label, username, pin] of [
    ['ops', world.gcOpsUsername ?? 'opspm', '135790'],
    ['single', 'single99', '990011'],
  ]) {
    const context = await browser.newContext({
      locale: 'he-IL',
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const page = await context.newPage();
    results.push(await tryLogin(page, username, pin, label));
    await context.close();
  }
} finally {
  await browser.close();
}
writeFileSync(path.join(here, 'employee-probe-summary.json'), JSON.stringify(results, null, 2));
const anyPass = results.some((r) => r.leftLogin && r.hasEmployeeShell);
process.exitCode = anyPass ? 0 : 1;
