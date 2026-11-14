import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import type { AnalysisView } from '@/modules/electrical-takeoff/domain/contracts';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';
import { TakeoffLimitationsBanner } from '@/modules/electrical-takeoff/ui/takeoff-limitations-banner';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

function viewWithManyNotes(): AnalysisView {
  const { view } = getReal7155Fixture();
  return {
    ...view,
    boq: {
      ...view.boq,
      completeness: {
        ...view.boq.completeness,
        scaleUnverifiedSheets: [view.sheets[0]!.sheetKey],
        xrefsMissing: ['missing-xref.dwg'],
      },
      unclassifiedCount: 3,
    },
  };
}

describe('TakeoffLimitationsBanner (compact / collapsible)', () => {
  it('is collapsed by default: one-line summary, no warning list', () => {
    render(wrap(<TakeoffLimitationsBanner view={viewWithManyNotes()} />));

    const toggle = screen.getByTestId('takeoff-limitations-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('takeoff-limitations-summary').textContent).toMatch(/הערות על הניתוח/);
    expect(screen.queryByTestId('takeoff-limitations-list')).toBeNull();
    expect(screen.queryByTestId('takeoff-open-sheets-panel')).toBeNull();
  });

  it('indicates warnings needing attention in the collapsed summary', () => {
    render(wrap(<TakeoffLimitationsBanner view={viewWithManyNotes()} />));
    expect(screen.getByTestId('takeoff-limitations-attention').textContent).toMatch(/דורשות תשומת לב/);
  });

  it('expands and collapses via the toggle with aria-expanded / aria-controls', () => {
    const onOpenSheetsPanel = vi.fn();
    render(wrap(<TakeoffLimitationsBanner view={viewWithManyNotes()} onOpenSheetsPanel={onOpenSheetsPanel} />));

    const toggle = screen.getByTestId('takeoff-limitations-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const list = screen.getByTestId('takeoff-limitations-list');
    expect(toggle.getAttribute('aria-controls')).toBe(list.id);
    expect(list.querySelectorAll('li').length).toBeGreaterThan(1);

    // existing action testids stay reachable once expanded
    fireEvent.click(screen.getByTestId('takeoff-open-sheets-panel'));
    expect(onOpenSheetsPanel).toHaveBeenCalledTimes(1);

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('takeoff-limitations-list')).toBeNull();
  });

  it('toggle is a native button (keyboard operable) with a 44px touch target', () => {
    render(wrap(<TakeoffLimitationsBanner view={viewWithManyNotes()} />));
    const toggle = screen.getByTestId('takeoff-limitations-toggle');
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle.className).toContain('min-h-11');
    expect(toggle.className).toContain('w-full');
  });

  it('shows an error count badge when a worker warning is an error', () => {
    const base = viewWithManyNotes();
    const view = {
      ...base,
      workerWarnings: [
        { code: 'merge_failed', severity: 'error', message: 'boom', sheetKey: null, fileId: null },
      ],
    } as unknown as AnalysisView;
    render(wrap(<TakeoffLimitationsBanner view={view} />));
    expect(screen.getByTestId('takeoff-limitations-attention').textContent).toMatch(/שגיאות או חסימות/);
  });
});
