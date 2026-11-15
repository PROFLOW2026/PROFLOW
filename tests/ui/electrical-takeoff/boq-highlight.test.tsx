import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import heTakeoff from '@/locales/he-IL/takeoff.json';
import { TakeoffBoqPanel } from '@/modules/electrical-takeoff/ui/takeoff-boq-panel';
import { buildDemoAnalysisView } from '@/modules/electrical-takeoff/ui/fixtures/demo-fixture';
import { buildDemoDetections } from '@/modules/electrical-takeoff/ui/fixtures/demo-fixture';

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

describe('TakeoffBoqPanel', () => {
  it('emits detection ids when a line is clicked', () => {
    const detections = buildDemoDetections();
    const view = buildDemoAnalysisView(detections);
    const line = {
      key: 'device_count|power.socket.single|||default',
      typeKey: 'power.socket.single',
      label: 'שקע',
      category: 'power' as const,
      lineKind: 'device_count' as const,
      unit: "יח'",
      quantity: 2,
      floor: null,
      areaId: null,
      ruleId: 'default',
      detectionIds: detections.slice(0, 2).map((d) => d.id),
      breakdown: { high: 2, medium: 0, low: 0, unclassified: 0, userAdded: 0, userConfirmed: 0 },
      verified: false,
      excluded: false,
    };
    view.boq = { ...view.boq, lines: [line] };
    let ids: string[] = [];
    render(
      wrap(
        <TakeoffBoqPanel
          boq={view.boq}
          lines={view.boq.lines}
          catalog={view.catalog}
          focusKey={null}
          onLineClick={(_key, detectionIds) => {
            ids = detectionIds;
          }}
        />,
      ),
    );
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(ids.length).toBeGreaterThan(0);
  });
});