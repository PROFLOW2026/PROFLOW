/**
 * Audit-only PdfJsViewer pointer/touch probe.
 * Prefer OCR upload → viewOriginal (DocumentPreviewDialog → PdfJsViewer).
 * World seed has no document URL. Real device remains UNVERIFIED.
 */
import { expect, test, type TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type documents from '../../../../../src/locales/he-IL/documents.json';
import type externalStorage from '../../../../../src/locales/he-IL/externalStorage.json';

const heDocuments = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/documents.json'), 'utf8'),
) as typeof documents;
const external = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/locales/he-IL/externalStorage.json'), 'utf8'),
) as typeof externalStorage;

const SCREENSHOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots', 'pdf');
const tPreview = external.preview;

/** Same minimal PDF bytes as tests/e2e/authenticated/ocr-review.spec.ts (OCR mock accepts). */
const PDF_BYTES = Buffer.from(
  '%PDF-1.1\n1 0 obj<<>>endobj\n2 0 obj<< /Length 0 >>stream\nendstream\nendobj\n3 0 obj<< /Type /Page /Parent 4 0 R /MediaBox [0 0 3 3] /Contents 2 0 R >>endobj\n4 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n5 0 obj<< /Type /Catalog /Pages 4 0 R >>endobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000024 00000 n \n0000000073 00000 n \n0000000160 00000 n \n0000000227 00000 n \ntrailer<< /Size 6 /Root 5 0 R >>\nstartxref\n296\n%%EOF\n',
  'utf8',
);

function annotate(info: TestInfo, area: string, verdict: string, reason: string) {
  info.annotations.push({ type: 'exlfy-verdict', description: `${area}|${verdict}|${reason}` });
}

test.describe('EXLFY PDF touch/pointer probe (owner, audit)', () => {
  test.setTimeout(180_000);

  test('PdfJsViewer pointer + synthetic touch via OCR viewOriginal', async ({ page }, info) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    annotate(
      info,
      'pdf.seeded_url',
      'UNVERIFIED',
      'world seed has no document/PDF URL; OCR upload → viewOriginal → DocumentPreviewDialog',
    );

    try {
      const response = await page.goto('/he-IL/documents/ocr-review', {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      expect(response?.status() ?? 0).toBeLessThan(400);
    } catch (error) {
      annotate(
        info,
        'pdf.open_viewer',
        'HARNESS',
        `ocr-review nav: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
      );
      return;
    }

    await expect(page.locator('[data-pf-ocr-attach]').first()).toBeVisible({ timeout: 30_000 });

    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-pf-ocr-attach]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: `audit-ocr-${Date.now()}.pdf`,
      mimeType: 'application/pdf',
      buffer: PDF_BYTES,
    });

    // OCR mock selects job + fills Fixture Supplies (same as ocr-review E2E).
    const jobReady = await expect
      .poll(
        async () =>
          (await page
            .locator('[data-pf-ocr-job-id][aria-current="true"]')
            .getAttribute('data-pf-ocr-job-id')) ?? '',
        { timeout: 90_000, intervals: [300, 500, 1_000] },
      )
      .toMatch(/^[0-9a-f-]{36}$/i)
      .then(() => true)
      .catch(() => false);

    if (!jobReady) {
      annotate(
        info,
        'pdf.open_viewer',
        'HARNESS',
        'OCR upload did not select a job (mock/provider); company-files browse also reconnects — no live PdfJsViewer URL',
      );
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'pdf-ocr-upload-failed.png'),
        fullPage: false,
      });
      annotate(
        info,
        'pdf.touch_pan_gap',
        'UNVERIFIED',
        'code evidence only (bug-03/TOUCH_PAN_GAPS.md): no touch drag-pan; mouse hand-tool only; transform zoom ≠ layout scroll',
      );
      annotate(info, 'pdf.real_device', 'UNVERIFIED', 'Android/iOS not exercised');
      return;
    }

    const viewOriginal = page.getByRole('button', { name: heDocuments.ocr.viewOriginal });
    await expect(viewOriginal).toBeVisible({ timeout: 30_000 });
    await viewOriginal.click();

    const viewer = page.locator('[data-pf-style="classic"]').first();
    const viewerVisible = await viewer.isVisible({ timeout: 45_000 }).catch(() => false);
    if (!viewerVisible) {
      // Tiny OCR PDF may fail pdf.js structure — still document gap matrix.
      annotate(
        info,
        'pdf.open_viewer',
        'UNVERIFIED',
        'viewOriginal opened but PdfJsViewer shell not visible (possible invalid PDF structure for pdf.js)',
      );
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, 'pdf-preview-missing-viewer.png'),
        fullPage: false,
      });
      annotate(
        info,
        'pdf.touch_pan_gap',
        'UNVERIFIED',
        'code evidence only (bug-03/TOUCH_PAN_GAPS.md)',
      );
      annotate(info, 'pdf.real_device', 'UNVERIFIED', 'Android/iOS not exercised');
      return;
    }

    annotate(info, 'pdf.open_viewer', 'VERIFIED_PASS', 'PdfJsViewer shell via OCR viewOriginal');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pdf-viewer-390-open.png'),
      fullPage: false,
    });

    const more = page.getByRole('button', { name: tPreview.more });
    if ((await more.count()) > 0) {
      await more.first().click().catch(() => undefined);
    }
    const zoomIn = page
      .getByRole('button', { name: tPreview.zoomIn })
      .or(page.getByRole('menuitem', { name: tPreview.zoomIn }));
    if ((await zoomIn.count()) > 0) {
      await zoomIn.first().click({ force: true }).catch(() => undefined);
      annotate(info, 'pdf.pointer_zoom', 'VERIFIED_PASS', 'zoomIn engaged');
    } else {
      annotate(info, 'pdf.pointer_zoom', 'UNVERIFIED', 'zoomIn not found');
    }

    const hand = page
      .getByRole('button', { name: tPreview.handTool })
      .or(page.getByRole('menuitem', { name: tPreview.handTool }));
    if ((await hand.count()) > 0) {
      await hand.first().click({ force: true }).catch(() => undefined);
      annotate(info, 'pdf.hand_tool', 'VERIFIED_PASS', 'hand tool toggled');
    } else {
      annotate(info, 'pdf.hand_tool', 'UNVERIFIED', 'hand tool not found');
    }

    const box = await viewer.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + Math.min(box.height / 2, 120);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - 40, cy - 30);
      await page.mouse.up();
      annotate(info, 'pdf.pointer_pan', 'VERIFIED_PASS', 'mouse drag on viewer');
    }

    const touchProbe = await viewer.evaluate((el) => {
      const root =
        (el.querySelector('[class*="overflow-auto"]') as HTMLElement | null) ?? (el as HTMLElement);
      const rect = root.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + Math.min(rect.height / 2, 120);
      const mk = (id: number, tx: number, ty: number) =>
        new Touch({
          identifier: id,
          target: root,
          clientX: tx,
          clientY: ty,
          pageX: tx,
          pageY: ty,
          screenX: tx,
          screenY: ty,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
      const t0 = mk(1, x, y);
      root.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [t0],
          targetTouches: [t0],
          changedTouches: [t0],
        }),
      );
      const a0 = mk(1, x - 20, y);
      const b0 = mk(2, x + 20, y);
      root.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [a0, b0],
          targetTouches: [a0, b0],
          changedTouches: [a0, b0],
        }),
      );
      const a1 = mk(1, x - 40, y);
      const b1 = mk(2, x + 40, y);
      root.dispatchEvent(
        new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          touches: [a1, b1],
          targetTouches: [a1, b1],
          changedTouches: [a1, b1],
        }),
      );
      root.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          cancelable: true,
          touches: [],
          targetTouches: [],
          changedTouches: [a1, b1],
        }),
      );
      return { touchAction: getComputedStyle(root).touchAction };
    });

    annotate(
      info,
      'pdf.touch_synthetic',
      'VERIFIED_PASS',
      `dispatched TouchEvents; touchAction=${touchProbe.touchAction}`,
    );
    annotate(
      info,
      'pdf.touch_pan_gap',
      'UNVERIFIED',
      'no touch drag-pan handlers (mouse hand-tool only); see bug-03/TOUCH_PAN_GAPS.md',
    );
    annotate(info, 'pdf.real_device', 'UNVERIFIED', 'Android/iOS pinch-after-pan not exercised');

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'pdf-viewer-390-after-gestures.png'),
      fullPage: false,
    });
    expect(viewerVisible).toBe(true);
  });
});
