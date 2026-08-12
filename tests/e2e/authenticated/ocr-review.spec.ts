import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
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
  const selectedLocator = page.locator('[data-pf-ocr-job-id][aria-current="true"]');
  const previousJobId =
    (await selectedLocator.count()) > 0
      ? ((await selectedLocator.getAttribute('data-pf-ocr-job-id')) ?? '')
      : '';

  const chooserPromise = page.waitForEvent('filechooser');
  await page
    .locator(options?.capture ? '[data-pf-ocr-capture]' : '[data-pf-ocr-attach]')
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name,
    mimeType,
    buffer,
  });

  // Require two consecutive identical ids so a late duplicate upload cannot
  // flip selection after the first selectJob and before the test captures ids.
  let seenJobId = '';
  await expect
    .poll(
      async () => {
        const id =
          (await page
            .locator('[data-pf-ocr-job-id][aria-current="true"]')
            .getAttribute('data-pf-ocr-job-id')) ?? '';
        if (!id || id === previousJobId) {
          seenJobId = '';
          return '';
        }
        if (id === seenJobId) return id;
        seenJobId = id;
        return '';
      },
      { timeout: 60_000, intervals: [300, 400, 500] },
    )
    .toMatch(/^[0-9a-f-]{36}$/i);

  await expect(page.locator('#ocr-vendor')).toHaveValue(/Fixture Supplies/, { timeout: 60_000 });
  await expect(page.locator('[data-pf-ocr-attach], [data-pf-ocr-capture]').first()).toBeEnabled({
    timeout: 60_000,
  });
}

async function selectedJobDocumentId(page: Page): Promise<string> {
  const selected = page.locator('[data-pf-ocr-job-id][aria-current="true"]');
  if ((await selected.count()) === 0) return '';
  return (await selected.getAttribute('data-pf-ocr-job-document-id')) ?? '';
}

async function selectedJobId(page: Page): Promise<string> {
  const selected = page.locator('[data-pf-ocr-job-id][aria-current="true"]');
  if ((await selected.count()) === 0) return '';
  return (await selected.getAttribute('data-pf-ocr-job-id')) ?? '';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Wait until the rendered preview bytes match the uploaded file (covers async signed-URL swap). */
async function expectPreviewChecksum(page: Page, expected: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const media = page.locator('[data-pf-ocr-original] img, [data-pf-ocr-original] iframe');
        if ((await media.count()) === 0) return '';
        const src = await media.first().getAttribute('src');
        if (!src) return '';
        const response = await page.request.get(src);
        if (!response.ok()) return '';
        return sha256(Buffer.from(await response.body()));
      },
      { timeout: 30_000, intervals: [250, 500, 1_000] },
    )
    .toBe(expected);
}

async function expectSelectedPreview(page: Page, documentId: string, checksum: string): Promise<void> {
  await expect(page.locator('[data-pf-ocr-job-id][aria-current="true"]')).toHaveAttribute(
    'data-pf-ocr-job-document-id',
    documentId,
  );
  await expect(page.locator('[data-pf-ocr-original]')).toHaveAttribute(
    'data-pf-preview-document-id',
    documentId,
  );
  await expectPreviewChecksum(page, checksum);
}

async function drainActiveQueue(page: Page): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const selected = page.locator('[data-pf-ocr-job-id][aria-current="true"]');
    if ((await selected.count()) === 0) {
      if ((await page.locator('[data-pf-ocr-job-id]').count()) === 0) return;
      await page.locator('[data-pf-ocr-job-id]').first().click();
    }
    const reject = page.getByRole('button', { name: he.documents.ocr.rejectReview });
    if ((await reject.count()) === 0 || (await reject.isDisabled())) return;
    const before = await selectedJobId(page);
    await reject.click();
    await expect
      .poll(async () => (await selectedJobId(page)) !== before || (await page.locator('[data-pf-ocr-job-id]').count()) === 0, {
        timeout: 30_000,
      })
      .toBe(true);
  }
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
    await drainActiveQueue(page);
    await expect(page.getByText(he.documents.ocr.providerLiveReady)).toBeVisible();
    await expect(page.getByText(he.documents.ocr.honesty)).toBeVisible();

    // Mobile/PWA-relevant camera capture control remains on the OCR surface.
    await expect(page.locator('input[capture="environment"]').first()).toBeAttached();

    await uploadReceipt(page, 'ocr-receipt.png');
    const jobExpense = await selectedJobId(page);
    await expect(page.getByText(he.documents.ocr.sourceDocument)).toBeVisible();
    await expect(page.getByRole('button', { name: he.documents.ocr.viewOriginal })).toBeVisible();

    await confirmDraftTarget(page, 'expense');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת הוצאה/i, {
      timeout: 30_000,
    });
    await expect(page.locator(`[data-pf-ocr-job-id="${jobExpense}"]`)).toHaveCount(0);

    await uploadReceipt(page, 'ocr-invoice.png');
    const jobBill = await selectedJobId(page);
    // Same bytes → exact-file duplicate warning when checksum index hits.
    await expect(page.getByText(he.documents.ocr.duplicateWarning)).toBeVisible({
      timeout: 15_000,
    });

    await confirmDraftTarget(page, 'vendor_bill');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת חשבונית ספק/i, {
      timeout: 30_000,
    });
    await expect(page.locator(`[data-pf-ocr-job-id="${jobBill}"]`)).toHaveCount(0);

    await uploadReceipt(page, 'ocr-credit.png');
    const jobCredit = await selectedJobId(page);
    await confirmDraftTarget(page, 'vendor_credit');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת זיכוי ספק/i, {
      timeout: 30_000,
    });
    await expect(page.locator(`[data-pf-ocr-job-id="${jobCredit}"]`)).toHaveCount(0);

    // Terminal jobs leave the active queue — no stale preview remains.
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-pf-ocr-original]')).toHaveCount(0);
    await expect(page.locator('#ocr-review-info')).not.toContainText(/סופי|finalized|posted/i);

    if (testInfo.project.name === 'mobile-he') {
      await expect(page.locator('[data-pf-ocr-review]')).toBeVisible();
      await expect(page.locator('input[capture="environment"]').first()).toBeAttached();
    }
  });

  test('active queue lifecycle: reject/approve remove jobs; refresh keeps them in history only', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/he-IL/documents/ocr-review');
    await drainActiveQueue(page);

    await uploadReceipt(page, 'queue-a.jpg', { mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    const jobA = await selectedJobId(page);
    const docA = await selectedJobDocumentId(page);

    await uploadReceipt(page, 'queue-b.png', { mimeType: 'image/png', buffer: PNG_BYTES });
    const jobB = await selectedJobId(page);
    expect(jobB).not.toBe(jobA);
    await expect(page.locator('[data-pf-ocr-job-id]')).toHaveCount(2);

    await page.locator(`[data-pf-ocr-job-id="${jobA}"]`).click();
    await expect(page.locator('[data-pf-ocr-job-id][aria-current="true"]')).toHaveAttribute(
      'data-pf-ocr-job-id',
      jobA,
    );
    await page.getByRole('button', { name: he.documents.ocr.rejectReview }).click();
    await expect(page.locator('#ocr-review-info')).toContainText(/נדחתה|נדחה/i, { timeout: 30_000 });
    await expect(page.locator(`[data-pf-ocr-job-id="${jobA}"]`)).toHaveCount(0);
    await expect(page.locator('[data-pf-ocr-job-id][aria-current="true"]')).toHaveAttribute(
      'data-pf-ocr-job-id',
      jobB,
    );
    await expect(page.locator('[data-pf-ocr-original]')).toHaveAttribute(
      'data-pf-preview-document-id',
      await selectedJobDocumentId(page),
    );
    expect(await selectedJobDocumentId(page)).not.toBe(docA);

    await confirmDraftTarget(page, 'expense');
    await expect(page.locator('#ocr-review-info')).toContainText(/נוצרה טיוטת הוצאה/i, {
      timeout: 30_000,
    });
    await expect(page.locator(`[data-pf-ocr-job-id="${jobB}"]`)).toHaveCount(0);
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible();
    await expect(page.locator('[data-pf-ocr-original]')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('[data-pf-ocr-review]')).toBeVisible();
    await expect(page.locator(`[data-pf-ocr-job-id="${jobA}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-pf-ocr-job-id="${jobB}"]`)).toHaveCount(0);
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible();

    await uploadReceipt(page, 'queue-c.pdf', { mimeType: 'application/pdf', buffer: PDF_BYTES });
    const jobC = await selectedJobId(page);
    expect(jobC).not.toBe(jobA);
    expect(jobC).not.toBe(jobB);
    await expect(page.locator('[data-pf-ocr-job-id]')).toHaveCount(1);

    await page.goto('/he-IL/documents/ocr-review/history');
    await expect(page.locator('[data-pf-ocr-history-page]')).toBeVisible();
    await expect(
      page.locator(`[data-pf-ocr-history-job-id="${jobA}"][data-pf-ocr-history-status="rejected"]`),
    ).toBeVisible();
    await expect(
      page.locator(`[data-pf-ocr-history-job-id="${jobB}"][data-pf-ocr-history-status="accepted"]`),
    ).toBeVisible();
    await expect(page.locator(`[data-pf-ocr-history-job-id="${jobC}"]`)).toHaveCount(0);

    await page.goto('/he-IL/documents/ocr-review');
    await page.locator(`[data-pf-ocr-job-id="${jobC}"]`).click();
    await page.getByRole('button', { name: he.documents.ocr.rejectReview }).click();
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible({ timeout: 30_000 });
  });

  test('one-item queue approve and reject clear preview', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/he-IL/documents/ocr-review');
    await drainActiveQueue(page);
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible();

    await uploadReceipt(page, 'solo-approve.jpg', { mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    const approveId = await selectedJobId(page);
    await confirmDraftTarget(page, 'expense');
    await expect(page.locator(`[data-pf-ocr-job-id="${approveId}"]`)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible();
    await expect(page.locator('[data-pf-ocr-original]')).toHaveCount(0);

    await uploadReceipt(page, 'solo-reject.png', { mimeType: 'image/png', buffer: PNG_BYTES });
    const rejectId = await selectedJobId(page);
    await page.getByRole('button', { name: he.documents.ocr.rejectReview }).click();
    await expect(page.locator(`[data-pf-ocr-job-id="${rejectId}"]`)).toHaveCount(0, {
      timeout: 30_000,
    });
    await expect(page.getByText(he.documents.ocr.empty)).toBeVisible();
    await expect(page.locator('[data-pf-ocr-original]')).toHaveCount(0);
  });

  test('desktop/mobile upload formats + preview stability (JPEG/PNG/PDF/camera)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    await page.goto('/he-IL/documents/ocr-review');
    await drainActiveQueue(page);

    await uploadReceipt(page, 'desk.jpg', { mimeType: 'image/jpeg', buffer: JPEG_BYTES });
    await expect(page.locator('[data-pf-ocr-original] img, [data-pf-ocr-original] iframe')).toBeVisible({
      timeout: 30_000,
    });
    const jobA = await selectedJobId(page);
    const docA = await selectedJobDocumentId(page);
    expect(jobA).toMatch(/^[0-9a-f-]{36}$/i);
    expect(docA).toMatch(/^[0-9a-f-]{36}$/i);
    const checksumA = sha256(JPEG_BYTES);
    await expectSelectedPreview(page, docA, checksumA);

    // Editing review fields must not change the selected document.
    await page.locator('#ocr-vendor').fill('Fixture Supplies Ltd');
    await page.locator('#ocr-reference').fill('REF-1');
    await expectSelectedPreview(page, docA, checksumA);

    await uploadReceipt(page, 'קבלה 12.08.2026.png', {
      mimeType: 'application/octet-stream',
      buffer: PNG_BYTES,
    });
    const jobB = await selectedJobId(page);
    const docB = await selectedJobDocumentId(page);
    expect(docB).not.toBe(docA);
    expect(jobB).not.toBe(jobA);
    const checksumB = sha256(PNG_BYTES);
    await expectSelectedPreview(page, docB, checksumB);
    expect(checksumB).not.toBe(checksumA);

    await page.locator(`[data-pf-ocr-job-id="${jobA}"]`).click();
    await expectSelectedPreview(page, docA, checksumA);
    await expect(page.locator('[data-pf-ocr-original] img')).toBeVisible();

    await page.locator(`[data-pf-ocr-job-id="${jobB}"]`).click();
    await expectSelectedPreview(page, docB, checksumB);

    await uploadReceipt(page, 'desk.pdf', { mimeType: 'application/pdf', buffer: PDF_BYTES });
    const jobC = await selectedJobId(page);
    const docC = await selectedJobDocumentId(page);
    expect(docC).not.toBe(docA);
    expect(docC).not.toBe(docB);
    await expect(page.locator('[data-pf-ocr-original] iframe')).toBeVisible();
    const checksumC = sha256(PDF_BYTES);
    await expectSelectedPreview(page, docC, checksumC);
    expect(checksumC).not.toBe(checksumA);

    await page.locator(`[data-pf-ocr-job-id="${jobA}"]`).click();
    await page.locator(`[data-pf-ocr-job-id="${jobB}"]`).click();
    await page.locator(`[data-pf-ocr-job-id="${jobC}"]`).click();
    await expectSelectedPreview(page, docC, checksumC);

    await page.locator(`[data-pf-ocr-job-id="${jobA}"]`).click();
    await expectSelectedPreview(page, docA, checksumA);
    await expect(page.locator('[data-pf-ocr-original] img')).toBeVisible();
    await expect(page.locator('[data-pf-ocr-original] iframe')).toHaveCount(0);

    if (testInfo.project.name === 'mobile-he') {
      await uploadReceipt(page, 'camera.jpg', {
        mimeType: 'image/jpeg',
        buffer: JPEG_BYTES,
        capture: true,
      });
    } else {
      await uploadReceipt(page, 'picker.jpg', { mimeType: '', buffer: JPEG_BYTES });
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
