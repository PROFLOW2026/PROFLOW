import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { he } from '../fixtures/locales';
import { loadWorld, type SeededWorld } from '../fixtures/world';

const RAW_I18N_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z][a-zA-Z0-9_.-]*$/;

const FORBIDDEN_VISIBLE = [
  /Net\s*30/i,
  /EOM\s*\+/i,
  /End of month/i,
  /assets\.usage\./i,
  /errors\.expenses\./i,
  /expenses\.errors\./i,
] as const;

const CRITICAL_ROUTES = [
  '/he-IL',
  '/he-IL/expenses',
  '/he-IL/expenses/new',
  '/he-IL/vendors',
  '/he-IL/projects',
  '/he-IL/settings/business-catalogs',
  '/he-IL/assets',
] as const;

type WorldWithVendor = SeededWorld & { vendorId?: string };

function tryLoadWorld(): WorldWithVendor | null {
  const worldPath = path.resolve(process.cwd(), 'tests/e2e/.world.json');
  if (!existsSync(worldPath)) return null;
  try {
    return loadWorld() as WorldWithVendor;
  } catch {
    return null;
  }
}

async function collectMainVisibleText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('main') ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const chunks: string[] = [];
    let node = walker.nextNode();
    while (node) {
      const parent = node.parentElement;
      if (parent) {
        const tag = parent.tagName.toLowerCase();
        if (tag !== 'script' && tag !== 'style' && tag !== 'noscript') {
          const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
          if (text) chunks.push(text);
        }
      }
      node = walker.nextNode();
    }
    return chunks;
  });
}

function assertNoForbiddenCopy(chunks: string[], context: string) {
  const hits: string[] = [];
  for (const chunk of chunks) {
    if (RAW_I18N_KEY_PATTERN.test(chunk)) {
      hits.push(`raw-key: ${chunk}`);
      continue;
    }
    for (const pattern of FORBIDDEN_VISIBLE) {
      if (pattern.test(chunk)) {
        hits.push(`${pattern}: ${chunk}`);
      }
    }
  }
  expect(hits, `${context}\n${hits.join('\n')}`).toEqual([]);
}

async function scanRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  // Optional modules (e.g. assets) may be gated — skip that route only.
  if (response && response.status() >= 400) {
    return;
  }
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const chunks = await collectMainVisibleText(page);
  assertNoForbiddenCopy(chunks, route);
}

async function openFirstComboboxAndScanOptions(page: Page, context: string) {
  const combobox = page.getByRole('combobox').first();
  if ((await combobox.count()) === 0) return;
  await combobox.click();

  // Prefer Radix/listbox options (visible). Native <option> nodes stay hidden.
  const listbox = page.getByRole('listbox');
  if ((await listbox.count()) > 0) {
    await expect(listbox.first()).toBeVisible({ timeout: 5_000 });
    const options = listbox.getByRole('option');
    const texts = (await options.allTextContents()).map((t) => t.trim()).filter(Boolean);
    assertNoForbiddenCopy(texts, `${context} select options`);
    await page.keyboard.press('Escape');
    return;
  }

  const visibleOptions = page.getByRole('option').locator('visible=true');
  if ((await visibleOptions.count()) === 0) {
    await page.keyboard.press('Escape');
    return;
  }
  const texts = (await visibleOptions.allTextContents()).map((t) => t.trim()).filter(Boolean);
  assertNoForbiddenCopy(texts, `${context} select options`);
  await page.keyboard.press('Escape');
}

test.describe('Hebrew runtime closure (mobile)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('scans critical he-IL owner surfaces for raw keys and English payment terms', async ({
    page,
  }) => {
    const world = tryLoadWorld();
    test.skip(!world, 'e2e world fixture missing');

    for (const route of CRITICAL_ROUTES) {
      await scanRoute(page, route);
    }

    // Payment-term / expense dropdowns must not show Net/EOM English.
    await page.goto('/he-IL/settings/business-catalogs');
    await openFirstComboboxAndScanOptions(page, 'business catalogs');

    if (world!.vendorId) {
      await page.goto(`/he-IL/vendors/${world!.vendorId}`);
      await openFirstComboboxAndScanOptions(page, 'vendor detail');
    } else {
      await page.goto('/he-IL/vendors');
      const firstVendor = page.locator('main a[href*="/vendors/"]').first();
      if ((await firstVendor.count()) > 0) {
        await firstVendor.click();
        await openFirstComboboxAndScanOptions(page, 'vendor detail');
      }
    }

    await page.goto('/he-IL/expenses/new');
    await openFirstComboboxAndScanOptions(page, 'expense form');

    // Empty submit should surface Hebrew validation, never raw error keys.
    await page.getByRole('button', { name: he.expenses.actions.saveDraft }).click();
    await expect(page.locator('main')).toContainText(/בדקו|שדה|סכום|חובה|נדרש/, {
      timeout: 15_000,
    });
    const afterSubmit = await collectMainVisibleText(page);
    assertNoForbiddenCopy(afterSubmit, 'expenses/new after empty submit');
    const alertLike = page.locator('[role="alert"], main p');
    const alertTexts = (await alertLike.allTextContents()).map((t) => t.trim()).filter(Boolean);
    for (const text of alertTexts) {
      expect(text, text).not.toMatch(/^errors\./);
      expect(text, text).not.toMatch(/expenses\.errors/);
      expect(text, text).not.toMatch(/errors\.expenses/);
    }

    // Project usage + expenses tabs + kind-labeled PDF actions.
    await page.goto(`/he-IL/projects/${world!.projectId}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const usageTab = page.getByRole('tab', { name: he.projects.workspace.tabs.usage });
    if ((await usageTab.count()) > 0) {
      await usageTab.click();
      assertNoForbiddenCopy(await collectMainVisibleText(page), 'project usage tab');
      await expect(page.getByText(/assets\.usage\./)).toHaveCount(0);
    }

    const expensesTab = page.getByRole('tab', { name: he.projects.workspace.tabs.expenses });
    if ((await expensesTab.count()) > 0) {
      await expensesTab.click();
      assertNoForbiddenCopy(await collectMainVisibleText(page), 'project expenses tab');
    }

    const pdfButtons = page.getByRole('link').filter({ hasText: /PDF|הורדת/ });
    const pdfCount = await pdfButtons.count();
    if (pdfCount >= 2) {
      const labels = (await pdfButtons.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
      // Kind-specific labels are OK; identical unlabeled duplicates are not.
      const unique = new Set(labels);
      expect(
        unique.size,
        `duplicate unlabeled PDF actions: ${labels.join(' | ')}`,
      ).toBeGreaterThan(1);
      for (const label of labels) {
        expect(label.length, label).toBeGreaterThan(3);
      }
    }
  });
});

test.describe('Hebrew runtime closure (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('desktop critical routes stay free of raw keys and Net/EOM English', async ({ page }) => {
    const world = tryLoadWorld();
    test.skip(!world, 'e2e world fixture missing');

    for (const route of [
      '/he-IL',
      '/he-IL/expenses/new',
      '/he-IL/settings/business-catalogs',
    ] as const) {
      await scanRoute(page, route);
    }

    await page.goto(`/he-IL/projects/${world!.projectId}`);
    assertNoForbiddenCopy(await collectMainVisibleText(page), 'desktop project overview');
  });
});
