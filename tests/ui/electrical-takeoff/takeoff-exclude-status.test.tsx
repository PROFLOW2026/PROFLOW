import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import { applyEdits } from '@/modules/electrical-takeoff/domain/edits';
import { TakeoffDetectionSheet } from '@/modules/electrical-takeoff/ui/takeoff-detection-sheet';
import { workerDet } from '../../unit/electrical-takeoff/domain/fixtures';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

function detection(partial: Partial<EffectiveDetection> = {}): EffectiveDetection {
  return {
    id: 'd1',
    sheetKey: 'layout:F0',
    x: 10,
    y: 10,
    w: 12,
    h: 12,
    typeKey: null,
    origin: 'auto',
    status: 'suggested',
    confidence: 'none',
    reasons: ['unclassified'],
    rawClass: 'noise',
    tagText: null,
    signature: 'block:noise',
    source: 'pdf',
    areaId: null,
    needsReview: true,
    ...partial,
  };
}

describe('excluded accessory sheet', () => {
  it('does not ask for a catalog type after an explicit exclude', () => {
    const onRestoreToBoq = vi.fn();
    render(
      wrap(
        <TakeoffDetectionSheet
          detection={detection({ reasons: ['user_excluded'], needsReview: false })}
          catalog={[]}
          readOnly={false}
          reasonLabel={(reason) => reason}
          groupSize={1}
          onClose={() => {}}
          onCommit={() => {}}
          onRestoreToBoq={onRestoreToBoq}
          onSetNote={() => {}}
          onDelete={() => {}}
          onRestore={() => {}}
        />,
      ),
    );

    expect(screen.getByTestId('takeoff-excluded-status')).toHaveTextContent(
      heTakeoff.detection.excludedFromBoqTitle,
    );
    expect(screen.queryByTestId('takeoff-confirm-detection')).toBeNull();
    expect(screen.queryByTestId('takeoff-apply-type')).toBeNull();
    expect(screen.queryByTestId('takeoff-need-type')).toBeNull();
    expect(screen.queryByTestId('takeoff-edit-type')).toBeNull();
    fireEvent.click(screen.getByTestId('takeoff-undo-exclude'));
    expect(onRestoreToBoq).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting unclassified on the save path', () => {
    render(
      wrap(
        <TakeoffDetectionSheet
          detection={detection()}
          catalog={[]}
          readOnly={false}
          reasonLabel={(reason) => reason}
          groupSize={1}
          onClose={() => {}}
          onCommit={() => {}}
          onExcludeFromBoq={() => {}}
          onSetNote={() => {}}
          onDelete={() => {}}
          onRestore={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('takeoff-need-type')).toHaveTextContent(heTakeoff.guide.pickOrNameRequired);
    expect(screen.getByTestId('takeoff-confirm-detection')).toBeDisabled();
    expect(screen.getByTestId('takeoff-edit-type-exclude')).toHaveTextContent(heTakeoff.catalog.excludeFromBoq);
  });

  it('restores an excluded mark back to waiting review after replay', () => {
    const base = [workerDet({ id: 'd1', sheetKey: 'p1', typeKey: null, reasons: ['unclassified'] })];
    const excluded = applyEdits(base, [{ op: 'set_boq_excluded', detectionId: 'd1', excluded: true }]);
    const restored = applyEdits(base, [
      { op: 'set_boq_excluded', detectionId: 'd1', excluded: true },
      { op: 'set_boq_excluded', detectionId: 'd1', excluded: false },
    ]);
    expect(excluded[0]?.reasons).toEqual(['user_excluded']);
    expect(excluded[0]?.needsReview).toBe(false);
    expect(restored[0]?.reasons).toContain('unclassified');
    expect(restored[0]?.reasons.includes('user_excluded')).toBe(false);
    expect(restored[0]?.needsReview).toBe(true);
    expect(restored[0]?.id).toBe('d1');
  });
});
