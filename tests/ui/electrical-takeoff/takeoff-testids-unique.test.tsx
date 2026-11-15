import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** Repeated per list item / per-sheet — allowed duplicates in the mounted tree. */
const ALLOW_MULTIPLE = new Set([
  'takeoff-detection-row',
  'takeoff-sheet-pair-suggest',
  'takeoff-plan-mark',
  'takeoff-boq-line',
  'takeoff-boq-line-unclassified',
  'takeoff-detection-reason',
]);

function isAllowedDuplicate(id: string): boolean {
  if (ALLOW_MULTIPLE.has(id)) return true;
  if (id.startsWith('takeoff-sheet-include-')) return true;
  return false;
}

function countTestIds(root: ParentNode): Map<string, number> {
  const counts = new Map<string, number>();
  root.querySelectorAll('[data-testid]').forEach((el) => {
    const id = el.getAttribute('data-testid');
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
}

function assertUniqueTestIds(root: ParentNode) {
  const dupes = [...countTestIds(root).entries()].filter(
    ([id, n]) => n > 1 && !isAllowedDuplicate(id),
  );
  expect(dupes, `duplicate data-testid values: ${dupes.map(([id, n]) => `${id}×${n}`).join(', ')}`).toEqual([]);
}

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl" className="flex max-w-[390px] min-w-0 flex-col overflow-x-hidden">
        {ui}
      </div>
    </NextIntlClientProvider>
  );
}

describe('takeoff workspace data-testid uniqueness (real7155)', () => {
  beforeEach(() => {
    resetTakeoffMockStore('real7155');
  });

  it('has no duplicate test ids with detection dialog open', async () => {
    const api = createMockTakeoffApi('real7155');
    const { container } = render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={REAL7155_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );

    const rows = await screen.findAllByTestId('takeoff-detection-row', undefined, { timeout: 15_000 });
    expect(rows.length).toBeGreaterThan(0);
    assertUniqueTestIds(container);

    fireEvent.click(rows[0]!);
    await waitFor(() => expect(screen.getByTestId('takeoff-edit-type')).toBeInTheDocument());
    expect(screen.getByTestId('takeoff-sidebar-edit-type')).toBeInTheDocument();
    assertUniqueTestIds(container);
  });
});