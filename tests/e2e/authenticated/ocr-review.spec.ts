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

const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//Z',
  'base64',
);

const PDF_BYTES = Buffer.from(
  '%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length 0 >>stream\nendstream\nendobj\n3 0 obj<< /Type /Page /Parent 4 0 R /MediaBox [0 0 3 3] /Contents 2 0 R >>endobj\n4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000024 00000 n \n0000000073 00000 n \n0000000160 00000 n \n0000000227 00000 n \ntrailer<< /Size 6 /Root 5 0 R >>\nstartxref\n296\n%%EOF\n',
  'utf8',
);

async function uploadReceipt(
  page: Page,
  name: string,
  options?: { mimeType?: string; buffer?: Buffer; capture?: boolean },
): Promise<void> {
  const mimeType = options?.mimeType ?? 'image/png';
  const buffer = options?.buffer ?? PNG_BYTES;
  const fileInput = options?.capture
    ? page.locator('input[type="file"][capture="environment"]').first()
    : page.locator('input[type="file"][accept*="image/jpeg"]').first();
  await fileInput.setInputFiles({
    name,
    mimeType,
    buffer,
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

  test('desktop/mobile upload formats + preview stability (JPEG/PNG/PDF/camera)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto('/he-IL/documents/ocr-review');

    await uploadReceipt(page, 'desk.jpg', { mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    await expect(page.locator('[data-pf-ocr-original] img, [data-pf-ocr-original] iframe')).toBeVisible({
      timeout: 30_000,
    });

    // Editing review fields must not tear down the original preview.
    await page.locator('#ocr-vendor').fill('Fixture Supplies Ltd');
    await page.locator('#ocr-reference').fill('REF-1');
    await expect(page.locator('[data-pf-ocr-original] img, [data-pf-ocr-original] iframe')).toBeVisible();

    await uploadReceipt(page, 'desk.png', { mimeType: 'image/png', buffer: PNG_BYTES });
    await uploadReceipt(page, 'desk.pdf', { mimeType: 'application/pdf', buffer: PDF_BYTES });

    if (testInfo.project.name === 'mobile-he') {
      await uploadReceipt(page, 'camera.jpg', {
        mimeType: 'image/jpeg',
        buffer: JPEG_BYTES,
        capture: true,
      });
    } else {
      // Normal mobile-style file picker path uses the non-capture input.
      await uploadReceipt(page, 'picker.jpg', { mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    }

    await page.getByRole('button', { name: he.documents.ocr.viewOriginal }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByText(he.common.actions.close, { exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('expenses list exposes OCR scan entry when live OCR is enabled', async ({ page }) => {
    await page.goto('/he-IL/expenses');
    await expect(page.getByRole('link', { name: he.documents.ocr.scanCta })).toBeVisible();
  });
});
