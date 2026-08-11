import { expect, test, type Page } from '@playwright/test';
import type documents from '../../../src/locales/he-IL/documents.json';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { he as heBase } from '../fixtures/locales';

const he = {
  ...heBase,
  documents: JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/documents.json'), 'utf8'),
  ) as typeof documents,
};

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function acceptCoreFields(page: Page): Promise<void> {
  for (const field of ['vendor', 'date', 'reference', 'gross', 'currency'] as const) {
    await page.locator(`#ocr-${field}`).locator('xpath=..').getByRole('checkbox').check();
  }
}

async function uploadReceipt(page: Page, name: string): Promise<void> {
  const fileInput = page.locator('input[type="file"][accept*="image/jpeg"]').first();
  await fileInput.setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: PNG_BYTES,
  });
  await expect(page.getByText(he.documents.ocr.extractQueuedReview)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('#ocr-vendor')).toHaveValue(/Fixture Supplies/);
}

async function confirmDraftTarget(
  page: Page,
  target: 'expense' | 'vendor_bill' | 'vendor_credit',
): Promise<void> {
  const radioLabel =
    target === 'expense'
      ? he.documents.ocr.draftTargetExpense
      : target === 'vendor_bill'
        ? he.documents.ocr.draftTargetVendorBill
        : he.documents.ocr.draftTargetVendorCredit;
  await page.locator('label').filter({ hasText: radioLabel }).getByRole('radio').check();

  if (target !== 'expense') {
    await page.locator('#ocr-vendor-entity').selectOption({ label: 'Fixture Supplies Ltd' });
  }

  await acceptCoreFields(page);

  const confirmLabel =
    target === 'expense'
      ? he.documents.ocr.confirmExpense
      : target === 'vendor_bill'
        ? he.documents.ocr.confirmVendorBill
        : he.documents.ocr.confirmVendorCredit;
  await page.getByRole('button', { name: confirmLabel }).click();
}

test.describe('OCR authenticated journey (mocked provider)', () => {
  test('Hebrew desktop/mobile: upload → review → expense/AP/credit drafts; original attached; no auto-finalize', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

    await page.goto('/he-IL/documents/ocr-review');
    await expect(page).toHaveURL(/\/he-IL\/documents\/ocr-review/);
    await expect(page.locator('[data-pf-ocr-review]')).toBeVisible();
    await expect(page.getByText(he.documents.ocr.providerLiveReady)).toBeVisible();
    await expect(page.getByText(he.documents.ocr.honesty)).toBeVisible();

    // Mobile/PWA-relevant camera capture control remains on the OCR surface.
    await expect(page.locator('input[capture="environment"]').first()).toBeAttached();

    await uploadReceipt(page, 'ocr-receipt.png');
    await expect(page.getByText(he.documents.ocr.sourceDocument)).toBeVisible();
    await expect(page.getByRole('button', { name: he.documents.ocr.viewOriginal })).toBeVisible();

    await confirmDraftTarget(page, 'expense');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת הוצאה/i, {
      timeout: 30_000,
    });

    await uploadReceipt(page, 'ocr-invoice.png');
    // Same bytes → exact-file duplicate warning when checksum index hits.
    await expect(page.getByText(he.documents.ocr.duplicateWarning)).toBeVisible({
      timeout: 15_000,
    });

    await confirmDraftTarget(page, 'vendor_bill');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת חשבונית ספק/i, {
      timeout: 30_000,
    });

    await uploadReceipt(page, 'ocr-credit.png');
    await confirmDraftTarget(page, 'vendor_credit');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת זיכוי ספק/i, {
      timeout: 30_000,
    });

    await expect(page.getByRole('button', { name: he.documents.ocr.viewOriginal })).toBeVisible();
    await expect(page.locator('#ocr-review-info')).not.toContainText(/סופי|finalized|posted/i);

    if (testInfo.project.name === 'mobile-he') {
      await expect(page.locator('[data-pf-ocr-review]')).toBeVisible();
      await expect(page.locator('input[capture="environment"]').first()).toBeAttached();
    }
  });

  test('expenses list exposes OCR scan entry when live OCR is enabled', async ({ page }) => {
    await page.goto('/he-IL/expenses');
    await expect(page.getByRole('link', { name: he.documents.ocr.scanCta })).toBeVisible();
  });
});
