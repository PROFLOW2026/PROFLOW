import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import type { EffectiveDetection } from '@/modules/electrical-takeoff/domain/contracts';
import { TakeoffDetectionSheet } from '@/modules/electrical-takeoff/ui/takeoff-detection-sheet';

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
    rawClass: '14e',
    tagText: null,
    signature: 'block:14e',
    source: 'dwg',
    areaId: null,
    needsReview: false,
    originalText: 'מפסק מאור',
    legendUnambiguous: true,
    identitySource: 'legend',
    ...partial,
  };
}

describe('legend description edit on the accessory sheet', () => {
  it('opens the original legend text for editing and saves only the label', () => {
    const onSetLabel = vi.fn();
    const onCommit = vi.fn();
    render(
      wrap(
        <TakeoffDetectionSheet
          detection={detection()}
          catalog={[]}
          readOnly={false}
          reasonLabel={(reason) => reason}
          groupSize={1}
          onClose={() => {}}
          onCommit={onCommit}
          onSetLabel={onSetLabel}
          onSetNote={() => {}}
          onDelete={() => {}}
          onRestore={() => {}}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('takeoff-edit-legend-description'));
    const input = screen.getByTestId('takeoff-legend-description-input');
    expect(input).toHaveValue('מפסק מאור');
    fireEvent.change(input, { target: { value: 'מפסק מאור יחיד' } });
    fireEvent.click(screen.getByTestId('takeoff-save-legend-description'));
    expect(onSetLabel).toHaveBeenCalledWith('מפסק מאור יחיד');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cancels without saving', () => {
    const onSetLabel = vi.fn();
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
          onSetLabel={onSetLabel}
          onSetNote={() => {}}
          onDelete={() => {}}
          onRestore={() => {}}
        />,
      ),
    );

    fireEvent.click(screen.getByTestId('takeoff-edit-legend-description'));
    fireEvent.change(screen.getByTestId('takeoff-legend-description-input'), {
      target: { value: 'טקסט זמני' },
    });
    fireEvent.click(screen.getByTestId('takeoff-cancel-legend-description'));
    expect(onSetLabel).not.toHaveBeenCalled();
    expect(screen.queryByTestId('takeoff-legend-description-input')).toBeNull();
    expect(screen.getAllByText('מפסק מאור').length).toBeGreaterThan(0);
  });
});
