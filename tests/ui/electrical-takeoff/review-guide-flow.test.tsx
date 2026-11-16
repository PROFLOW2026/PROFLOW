import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import type { TakeoffEdit } from '@/modules/electrical-takeoff/domain/contracts';
import { exportTakeoffBoqXlsx } from '@/modules/electrical-takeoff/application/export-xlsx';
import { TakeoffApiProvider } from '@/modules/electrical-takeoff/ui/api-provider';
import { DEMO_ANALYSIS_ID, DEMO_PROJECT_ID, createMockTakeoffApi, resetTakeoffMockStore } from '@/modules/electrical-takeoff/ui/mock-api';
import { TakeoffWorkspace } from '@/modules/electrical-takeoff/ui/takeoff-workspace';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

function switchQuantity(lines: { typeKey: string | null; quantity: number; excluded?: boolean }[]): number {
  return lines.filter((line) => line.typeKey === 'control.switch' && !line.excluded).reduce((sum, line) => sum + line.quantity, 0);
}

describe('guided takeoff review', () => {
  beforeEach(() => {
    resetTakeoffMockStore('default');
  });

  it('saves one occurrence, leaves the other marks, and keeps the quantity after reopen', async () => {
    const api = createMockTakeoffApi('default');
    const seen: TakeoffEdit[] = [];
    const applyEdits = api.applyEdits.bind(api);
    api.applyEdits = (analysisId, edits, expectedRevision) => {
      seen.push(...edits);
      return applyEdits(analysisId, edits, expectedRevision);
    };
    const before = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    const beforeQty = switchQuantity(before.boq.lines);

    const view = render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={DEMO_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );

    await screen.findByTestId('takeoff-review-guide', undefined, { timeout: 15_000 });
    fireEvent.click(screen.getByRole('button', { name: heTakeoff.workspace.reviewNow }));
    const guide = screen.getByTestId('takeoff-review-guide');
    const ids = guide.getAttribute('data-group-ids')?.split(',') ?? [];
    const focusId = guide.getAttribute('data-focus-id');
    expect(ids.length).toBeGreaterThan(1);
    expect(screen.getByTestId('takeoff-guide-scope-one')).toBeChecked();
    expect(screen.getByTestId('takeoff-guide-reason')).toHaveTextContent(heTakeoff.guide.reason.missingType);
    expect(screen.getByTestId('takeoff-guide-symbol')).toHaveAttribute('data-symbol-state', 'ready');
    fireEvent.click(screen.getByTestId('takeoff-guide-next-occurrence'));
    expect(screen.getByTestId('takeoff-review-guide').getAttribute('data-focus-id')).not.toBe(focusId);
    fireEvent.click(screen.getByTestId('takeoff-guide-prev-occurrence'));
    expect(screen.getByTestId('takeoff-review-guide').getAttribute('data-focus-id')).toBe(focusId);

    fireEvent.change(screen.getByTestId('takeoff-guide-type'), { target: { value: 'control.switch' } });
    fireEvent.click(screen.getByTestId('takeoff-guide-confirm'));

    await waitFor(() => {
      const reclassified = seen.filter((edit) => edit.op === 'reclassify');
      expect(reclassified).toHaveLength(1);
      expect(reclassified[0]).toMatchObject({ detectionId: focusId, typeKey: 'control.switch', saveToLibrary: false });
      const confirmed = seen.filter((edit) => edit.op === 'confirm');
      expect(confirmed).toEqual([{ op: 'confirm', detectionIds: [focusId] }]);
    });

    const saved = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    expect(saved.detections.find((item) => item.id === focusId)?.typeKey).toBe('control.switch');
    for (const id of ids) {
      if (id === focusId) continue;
      expect(saved.detections.find((item) => item.id === id)?.typeKey).toBeNull();
    }
    expect(switchQuantity(saved.boq.lines)).toBe(beforeQty + 1);

    view.unmount();
    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={DEMO_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );
    const reopened = await api.getAnalysisView(DEMO_ANALYSIS_ID);
    expect(reopened.detections.find((item) => item.id === focusId)?.typeKey).toBe('control.switch');

    const buffer = await exportTakeoffBoqXlsx({
      title: 'כתב כמויות',
      boq: reopened.boq,
      catalog: reopened.catalog,
      detections: reopened.detections,
      sheets: reopened.sheets,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const detail = workbook.getWorksheet('פירוט זיהויים');
    let savedType = '';
    detail?.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (row.getCell(1).text !== focusId) return;
      savedType = row.getCell(3).text;
    });
    expect(savedType).toBe('מפסק');
    const summary = workbook.getWorksheet('סיכום כתב כמויות');
    let summaryQty = 0;
    summary?.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      summaryQty += Number(row.getCell(4).value ?? 0);
    });
    const boqQty = reopened.boq.lines.filter((line) => !line.excluded).reduce((sum, line) => sum + line.quantity, 0);
    expect(summaryQty).toBe(boqQty);
    expect(switchQuantity(reopened.boq.lines)).toBe(beforeQty + 1);
  });

  it('does not move to the next group when saving fails', async () => {
    const api = createMockTakeoffApi('default');
    api.applyEdits = () => Promise.reject(new Error('save_failed'));
    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={DEMO_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );
    const guide = await screen.findByTestId('takeoff-review-guide', undefined, { timeout: 15_000 });
    const focusId = guide.getAttribute('data-focus-id');
    fireEvent.change(screen.getByTestId('takeoff-guide-type'), { target: { value: 'control.switch' } });
    fireEvent.click(screen.getByTestId('takeoff-guide-confirm'));
    expect(await screen.findByText(heTakeoff.workspace.saveFailed)).toBeInTheDocument();
    expect(screen.getByTestId('takeoff-review-guide').getAttribute('data-focus-id')).toBe(focusId);
  });
});
