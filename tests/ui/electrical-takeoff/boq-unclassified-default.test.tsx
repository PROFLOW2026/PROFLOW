import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import { TakeoffApiProvider } from '@/modules/electrical-takeoff/ui/api-provider';
import {
  DEMO_PROJECT_ID,
  REAL7155_ANALYSIS_ID,
  createMockTakeoffApi,
  resetTakeoffMockStore,
} from '@/modules/electrical-takeoff/ui/mock-api';
import { TakeoffWorkspace } from '@/modules/electrical-takeoff/ui/takeoff-workspace';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

describe('TakeoffWorkspace BOQ unclassified defaults', () => {
  beforeEach(() => {
    resetTakeoffMockStore('real7155');
  });

  it('shows unclassified BOQ rows by default', async () => {
    const api = createMockTakeoffApi('real7155');
    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={REAL7155_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );
    await screen.findByTestId('takeoff-boq-panel', undefined, { timeout: 15_000 });
    const unclassifiedRows = await screen.findAllByTestId('takeoff-boq-line-unclassified', undefined, {
      timeout: 15_000,
    });
    expect(unclassifiedRows.length).toBeGreaterThan(0);
    expect(screen.getAllByText(heTakeoff.detection.unclassified).length).toBeGreaterThan(0);
  });

  it('disables approve while review or unclassified counts remain', async () => {
    const api = createMockTakeoffApi('real7155');
    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={REAL7155_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );
    const approve = await screen.findByTestId('takeoff-approve', undefined, { timeout: 15_000 });
    expect(approve).toHaveProperty('disabled', true);
  });
});