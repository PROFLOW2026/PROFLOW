import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import { TakeoffApiProvider } from '@/modules/electrical-takeoff/ui/api-provider';
import { createMockTakeoffApi, DEMO_PROJECT_ID, REAL7155_ANALYSIS_ID, resetTakeoffMockStore } from '@/modules/electrical-takeoff/ui/mock-api';
import { TakeoffWorkspace } from '@/modules/electrical-takeoff/ui/takeoff-workspace';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl" className="max-w-[390px] overflow-x-hidden">{ui}</div>
    </NextIntlClientProvider>
  );
}

describe('TakeoffSheetsPanel via workspace', () => {
  beforeEach(() => resetTakeoffMockStore('real7155'));

  it('excludes a sheet and lowers BOQ counted total', async () => {
    const api = createMockTakeoffApi('real7155');
    const beforeView = await api.getAnalysisView(REAL7155_ANALYSIS_ID);
    const beforeCounted = beforeView.boq.counting?.countedTotal ?? 0;
    expect(beforeCounted).toBeGreaterThan(10);

    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={REAL7155_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );

    await screen.findByTestId('takeoff-sheets-panel', undefined, { timeout: 15_000 });
    fireEvent.click(screen.getByTestId('takeoff-sheets-select-none'));
    await waitFor(
      async () => {
        const after = await api.getAnalysisView(REAL7155_ANALYSIS_ID);
        expect(after.boq.counting?.countedTotal ?? 0).toBeLessThan(beforeCounted);
      },
      { timeout: 10_000 },
    );
  });
});