import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { CadDwgViewerToolbar } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-dwg-viewer-toolbar';

describe('CadDwgViewerToolbar mobile single-row layout', () => {
  it('keeps controls in a nowrap row with a visible Model trigger', () => {
    render(
      <NextIntlClientProvider locale="he-IL" messages={{}} timeZone="Asia/Jerusalem">
        <div style={{ width: 390 }}>
          <div className="relative h-40 w-full">
            <CadDwgViewerToolbar
              spaces={['*Model_Space', '*Paper_Space']}
              activeSpace="*Model_Space"
              onSpaceChange={vi.fn()}
              banners={[]}
              locale="he-IL"
              plotView={false}
              onPlotViewChange={vi.fn()}
              viewerVersion="v1"
              onViewerVersionChange={vi.fn()}
            />
          </div>
        </div>
      </NextIntlClientProvider>,
    );

    const controls = screen.getByTestId('cad-dwg-toolbar-controls');
    expect(controls.className).toMatch(/flex-nowrap/);
    expect(controls.className).not.toMatch(/flex-wrap/);
    expect(controls.className).toMatch(/overflow-hidden/);

    const modelTrigger = screen.getByRole('combobox', { name: /Model or layout/i });
    expect(modelTrigger).toBeInTheDocument();
    expect(modelTrigger.className).toMatch(/min-w-0/);
    expect(modelTrigger.className).toMatch(/flex-1/);
    // Mobile must not force the old 7.5rem min that pushed Model to a second row.
    expect(modelTrigger.className).not.toMatch(/(?:^|\s)min-w-\[7\.5rem\](?:\s|$)/);
    expect(modelTrigger.className).toMatch(/sm:min-w-\[7\.5rem\]/);
  });
});
