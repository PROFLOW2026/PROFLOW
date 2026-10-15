/**
 * Visual smoke: text overlay canvas has non-empty pixels after load.
 * Requires dev server + Playwright browsers installed.
 *
 *   npx playwright install chromium
 *   node scripts/pf-cad-text-canvas-visual.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PF_CAD_DEV_URL ?? 'http://localhost:3100';
const LOCALE = process.env.PF_CAD_DEV_LOCALE ?? 'he-IL';

async function sampleTextCanvas(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('[data-testid="pf-cad-text-canvas"]');
    if (!(cv instanceof HTMLCanvasElement) || cv.width < 2 || cv.height < 2) {
      return { ok: false, reason: 'no_canvas', w: cv?.width ?? 0, h: cv?.height ?? 0 };
    }
    const ctx = cv.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no_ctx' };
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let nonEmpty = 0;
    for (let i = 3; i < data.length; i += 16) {
      if (data[i] > 8) nonEmpty += 1;
    }
    return {
      ok: nonEmpty > 40,
      nonEmptySamples: nonEmpty,
      w: cv.width,
      h: cv.height,
    };
  });
}

async function runSample(page, sampleId) {
  await page.goto(`${BASE}/${LOCALE}/dev/pf-cad-viewer`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: sampleId }).click();
  await page.waitForTimeout(800);
  await page.waitForFunction(
    () => !document.querySelector('[class*="StorageLoadingOverlay"]'),
    { timeout: 120_000 },
  ).catch(() => {});
  for (let i = 0; i < 40; i += 1) {
    const snap = await sampleTextCanvas(page);
    if (snap.ok) return snap;
    await page.waitForTimeout(500);
  }
  return sampleTextCanvas(page);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const results = {};
for (const id of ['3031-SW', '3096-EL']) {
  results[id] = await runSample(page, id);
}
await browser.close();
console.log(JSON.stringify({ base: BASE, locale: LOCALE, results }, null, 2));
const failed = Object.entries(results).filter(([, v]) => !v.ok);
process.exit(failed.length > 0 ? 1 : 0);
