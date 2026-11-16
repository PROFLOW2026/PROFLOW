import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import type { TakeoffEdit } from '@/modules/electrical-takeoff/domain/contracts';
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

describe('manual legend correction on the plan and BOQ', () => {
  beforeEach(() => {
    resetTakeoffMockStore('default');
  });

  it('keeps unclassified rows, names typed marks from the catalog, and saves a reclassify to the library', async () => {
    const api = createMockTakeoffApi('default');
    const seen: TakeoffEdit[] = [];
    const applyEdits = api.applyEdits.bind(api);
    api.applyEdits = (analysisId, edits, expectedRevision) => {
      seen.push(...edits);
      return applyEdits(analysisId, edits, expectedRevision);
    };

    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={DEMO_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );

    await screen.findByTestId('takeoff-boq-panel', undefined, { timeout: 15_000 });
    const unclassifiedRows = await screen.findAllByTestId('takeoff-boq-line-unclassified');
    expect(unclassifiedRows.length).toBeGreaterThan(0);
    expect(unclassifiedRows[0]).toHaveTextContent(heTakeoff.detection.unclassified);
    expect(unclassifiedRows[0]?.textContent ?? '').not.toMatch(/L\d|p\d+#\d+/);

    const marks = screen.getAllByTestId('takeoff-plan-mark');
    expect(marks.some((mark) => mark.getAttribute('data-mark-label') === 'מפסק')).toBe(true);
    expect(marks.some((mark) => mark.getAttribute('data-mark-label') === heTakeoff.detection.unclassified)).toBe(true);
    for (const mark of marks) {
      expect(mark.getAttribute('data-mark-label') ?? '').not.toMatch(/^p\d+#\d+/);
    }

    const unclassifiedRow = screen
      .getAllByTestId('takeoff-detection-row')
      .find((row) => row.getAttribute('aria-label')?.includes(heTakeoff.detection.unclassified));
    expect(unclassifiedRow).toBeTruthy();
    fireEvent.click(unclassifiedRow!);

    fireEvent.change(screen.getByTestId('takeoff-guide-type'), { target: { value: 'control.switch' } });
    fireEvent.click(screen.getByTestId('takeoff-guide-scope-group'));
    fireEvent.click(screen.getByTestId('takeoff-guide-save-library'));
    const ids = screen.getByTestId('takeoff-review-guide').getAttribute('data-group-ids')?.split(',') ?? [];
    expect(ids.length).toBeGreaterThan(1);
    fireEvent.click(screen.getByTestId('takeoff-guide-confirm'));

    await waitFor(
      () => {
        const reclassified = seen.filter((edit) => edit.op === 'reclassify');
        expect(reclassified).toHaveLength(ids.length);
        expect(
          reclassified.every(
            (edit) => edit.op === 'reclassify' && edit.typeKey === 'control.switch' && edit.saveToLibrary === true,
          ),
        ).toBe(true);
      },
      { timeout: 4_000 },
    );
  });

  it('uses an unread legend row as the exemplar and saves the group to the library', async () => {
    const api = createMockTakeoffApi('default');
    const seen: TakeoffEdit[] = [];
    const applyEdits = api.applyEdits.bind(api);
    api.applyEdits = (analysisId, edits, expectedRevision) => {
      seen.push(...edits);
      return applyEdits(analysisId, edits, expectedRevision);
    };

    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={DEMO_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );

    const exemplars = await screen.findAllByTestId('takeoff-legend-exemplar', undefined, { timeout: 15_000 });
    const exemplar = exemplars[0];
    if (!exemplar) throw new Error('missing legend exemplar');
    const legendKey = exemplar.getAttribute('data-legend-key');
    const count = Number(exemplar.getAttribute('data-count'));
    expect(legendKey).toMatch(/^L\d+$/i);
    expect(count).toBeGreaterThan(1);
    fireEvent.click(exemplar);

    fireEvent.change(screen.getByTestId('takeoff-edit-type'), { target: { value: 'control.switch' } });
    fireEvent.click(screen.getByTestId('takeoff-save-to-library'));
    const groupBox = screen.getByTestId('takeoff-apply-symbol-group') as HTMLInputElement;
    expect(groupBox.checked).toBe(true);
    fireEvent.click(screen.getByTestId('takeoff-apply-type'));

    await waitFor(
      () => {
        const reclassified = seen.filter((edit) => edit.op === 'reclassify');
        expect(reclassified).toHaveLength(count);
        expect(
          reclassified.every(
            (edit) => edit.op === 'reclassify' && edit.typeKey === 'control.switch' && edit.saveToLibrary === true,
          ),
        ).toBe(true);
      },
      { timeout: 4_000 },
    );
  });
});
