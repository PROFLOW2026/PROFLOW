/**
 * Measure Employee Home scroll overflow on mobile viewport.
 * READ-ONLY: never resets PIN. Provide credentials via env:
 *   EMPLOYEE_APP_SMOKE_USERNAME
 *   EMPLOYEE_APP_SMOKE_PIN
 */
import dotenv from 'dotenv';
import { chromium, devices } from 'playwright';
import { resolveSmokeUsername } from './lib/employee-app-script-safety';

dotenv.config({ path: '.env.local', override: true });

const BASE = process.env.MEASURE_BASE_URL ?? 'http://localhost:3000';

function resolveSmokePin(): string {
  const pin = process.env.EMPLOYEE_APP_SMOKE_PIN?.trim();
  if (!pin) {
    throw new Error(
      'Set EMPLOYEE_APP_SMOKE_PIN for scroll measurement login (never run reset scripts on production employees).',
    );
  }
  return pin;
}

async function main(): Promise<void> {
  const username = resolveSmokeUsername();
  const pin = resolveSmokePin();

  const browser = await chromium.launch({ headless: true });
  const iphone = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iphone,
    locale: 'he-IL',
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/he-IL/employee/login?u=${encodeURIComponent(username)}`, {
    waitUntil: 'networkidle',
  });
  await page.fill('#username', username);
  await page.fill('#pin', pin);
  await page.getByRole('button', { name: /כניסה/i }).click();
  await page.waitForTimeout(3000);

  if (page.url().includes('/employee/set-pin')) {
    throw new Error(
      'Account requires set-pin; provide a smoke test account with a working PIN instead of resetting production credentials.',
    );
  }

  const loggedIn = !page.url().includes('/login') && !page.url().includes('/set-pin');
  if (!loggedIn) {
    console.log(JSON.stringify({ error: 'login_failed', url: page.url() }, null, 2));
    await browser.close();
    process.exit(1);
  }

  await page.goto(`${BASE}/he-IL/employee`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-pf-employee-app]', { timeout: 15_000 });

  const metrics = await page.evaluate(() => {
    const chain = ['html', 'body', 'body > div', 'header', 'main', 'nav[aria-label]', 'main > div'].map(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, info: null };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          sel,
          info: {
            tag: el.tagName.toLowerCase(),
            className: String(el.className).slice(0, 120),
            bottom: r.bottom,
            height: r.height,
            scrollHeight: el.scrollHeight,
            minHeight: cs.minHeight,
            paddingBottom: cs.paddingBottom,
            position: cs.position,
          },
        };
      },
    );

    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 1) {
        culprits.push({
          tag: el.tagName.toLowerCase(),
          className: String(el.className).slice(0, 100),
          bottom: r.bottom,
          height: r.height,
        });
      }
    }
    culprits.sort((a, b) => b.bottom - a.bottom);

    const rootStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);

    const shell = document.querySelector('[data-pf-employee-app]');
    const mainEl = document.querySelector('main');
    const shellRect = shell ? shell.getBoundingClientRect() : null;
    const mainScroll =
      mainEl instanceof HTMLElement
        ? {
            clientHeight: mainEl.clientHeight,
            scrollHeight: mainEl.scrollHeight,
            internalOverflow: mainEl.scrollHeight - mainEl.clientHeight,
          }
        : null;

    return {
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport ? window.visualViewport.height : null,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      overflowDelta: document.documentElement.scrollHeight - window.innerHeight,
      shellHeight: shellRect ? shellRect.height : null,
      mainScroll,
      cssVars: {
        bottomnavTotal: rootStyles.getPropertyValue('--pf-bottomnav-total-height').trim(),
        topbarHeight: rootStyles.getPropertyValue('--pf-topbar-height').trim(),
      },
      htmlMinHeight: rootStyles.minHeight,
      bodyMinHeight: bodyStyles.minHeight,
      chain,
      culpritsBelowViewport: culprits.slice(0, 8),
    };
  });

  console.log(JSON.stringify({ loggedIn: true, url: page.url(), metrics }, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
