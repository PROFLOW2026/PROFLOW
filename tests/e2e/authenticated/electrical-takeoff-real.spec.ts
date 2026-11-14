import path from 'node:path';
import { expect, test } from '@playwright/test';
import { resolveTakeoffCorpusFiles } from '../../helpers/takeoff-corpus';
import { loadWorld } from '../fixtures/world';
import { APP_URL } from '../harness/config';

const corpus = resolveTakeoffCorpusFiles();
const enabled = process.env.TAKEOFF_E2E_REAL === '1' && corpus !== null;
const world = loadWorld();
test.describe('electrical takeoff (7155 real worker)', () => {
  test.skip(!enabled, 'Set TAKEOFF_E2E_REAL=1 with 7155 corpus under Downloads/FW__*');
  test.setTimeout(600_000);

  test('owner: full corpus flow with real worker', async ({ page }) => {
    const projectId = world.projectId;
    const files = corpus!;

    await page.goto(`${APP_URL}/he-IL/projects/${projectId}/takeoff`);
    await page.getByTestId('takeoff-new-analysis').click();

    await page.getByTestId('takeoff-upload-input').setInputFiles([files.pdfLegend, files.pdfLighting, files.dwg]);

    await page.getByTestId('takeoff-pair-pdf').selectOption({ label: path.basename(files.pdfLighting) });
    await page.getByTestId('takeoff-pair-dwg').selectOption({ label: path.basename(files.dwg) });

    const dwgLayouts = page.getByTestId('takeoff-dwg-layouts');
    if (await dwgLayouts.isVisible()) {
      await dwgLayouts.fill('מקרא\nתאורה ג');
    }

    await page.getByTestId('takeoff-start-analysis').click();

    await expect(page.getByTestId('takeoff-detection-row').first()).toBeVisible({ timeout: 360_000 });

    const detectionCount = await page.getByTestId('takeoff-detection-row').count();
    expect(detectionCount).toBeGreaterThan(0);

    const counting = page.getByTestId('takeoff-boq-counting');
    await expect(counting).toBeVisible({ timeout: 30_000 });
    const countingText = (await counting.textContent()) ?? '';
    test.info().annotations.push({ type: 'boq-counting', description: countingText });
    if (process.env.TAKEOFF_E2E_CORPUS_7155_LIGHT_G === '1') {
      // Authoritative app engine (computeBoq): plan layout only. The worker stat
      // `boq_countable` (250) also counts the 31 DWG symbols of `layout:מקרא`, which the
      // app excludes by default (legend sheet) -> 250 - 31 = 219. Real run (round 14):
      // counted 219, twins 151, legend_zone 47 (46 expected + 1 on light PDF p1).
      expect(countingText).toMatch(/219/);
      expect(countingText).toMatch(/151/);
      expect(countingText).toMatch(/4[67]/);
      expect(countingText).not.toMatch(/\b(630|652)\b/);
    }

    await page.getByTestId('takeoff-detection-row').first().click();
    const typeSelect = page.getByRole('dialog', { name: 'פרטי זיהוי' }).getByTestId('takeoff-edit-type');
    if (await typeSelect.isVisible()) {
      const options = await typeSelect.locator('option').all();
      if (options.length > 1) {
        await typeSelect.selectOption({ index: 1 });
        await page.getByRole('dialog', { name: 'פרטי זיהוי' }).getByTestId('takeoff-apply-type').click();
        await page.keyboard.press('Escape');
      }
    }

    if (detectionCount > 1) {
      await page.getByTestId('takeoff-detection-row').nth(1).click();
      const del = page.getByRole('dialog', { name: 'פרטי זיהוי' }).getByTestId('takeoff-delete-detection');
      if (await del.isVisible()) {
        await del.click();
        await page.keyboard.press('Escape');
      }
    }

    await page.getByTestId('takeoff-approve').click();
    await expect(page.getByTestId('takeoff-export-xlsx')).toBeEnabled({ timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId('takeoff-detection-row').first()).toBeVisible({ timeout: 120_000 });

    const downloadBytes = async (testId: string): Promise<Buffer> => {
      await page.getByTestId(testId).click();
      const link = page.getByTestId(testId).locator('..').getByRole('link');
      await expect(link).toBeVisible({ timeout: 300_000 });
      const href = await link.getAttribute('href');
      expect(href, `export ${testId} href`).toBeTruthy();
      const url = new URL(href!, page.url()).href;
      const bytes = await page.evaluate(async (downloadUrl) => {
        const res = await fetch(downloadUrl, { credentials: 'include' });
        if (!res.ok) throw new Error(`export_http_${res.status}`);
        const ab = await res.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, url);
      const buf = Buffer.from(bytes);
      expect(buf.byteLength, `export ${testId} empty body`).toBeGreaterThan(100);
      return buf;
    };

    const xlsxBuf = await downloadBytes('takeoff-export-xlsx');
    expect(xlsxBuf.subarray(0, 2).toString('ascii')).toBe('PK');
    expect(xlsxBuf.byteLength).toBeGreaterThan(10_000);
    expect(xlsxBuf.includes(Buffer.from('xl/workbook.xml'))).toBe(true);
    expect(xlsxBuf.includes(Buffer.from('xl/sharedStrings.xml'))).toBe(true);
    test.info().annotations.push({ type: 'xlsx-bytes', description: String(xlsxBuf.byteLength) });
    expect(countingText).toMatch(/219/);

    const boqPdf = await downloadBytes('takeoff-export-boq-pdf');
    expect(boqPdf.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(boqPdf.byteLength).toBeGreaterThan(500);

    const annotated = await downloadBytes('takeoff-export-annotated-pdf');
    expect(annotated.subarray(0, 4).toString('ascii')).toBe('%PDF');
    expect(annotated.byteLength).toBeGreaterThan(100_000);
    const annotatedLatin = annotated.toString('latin1');
    // Worker merges a ReportLab vector overlay (content streams), not PDF /Annots widgets.
    const overlayRects = annotatedLatin.match(/\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)? re/g) ?? [];
    expect(overlayRects.length).toBeGreaterThan(5);
    test.info().annotations.push({
      type: 'annotated-bytes',
      description: `${annotated.byteLength};overlayRects=${overlayRects.length}`,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('takeoff-boq-counting')).toHaveText(/219/, { timeout: 30_000 });

    if (await page.getByTestId('takeoff-reopen').isVisible()) {
      await page.getByTestId('takeoff-reopen').click();
      await expect(page.getByTestId('takeoff-approve')).toBeVisible({ timeout: 30_000 });
    }
  });
});