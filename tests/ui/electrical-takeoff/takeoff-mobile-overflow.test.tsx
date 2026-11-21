import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
import { TakeoffUploadWizard } from '@/modules/electrical-takeoff/ui/takeoff-upload-wizard';
import { TakeoffDetectionSheet } from '@/modules/electrical-takeoff/ui/takeoff-detection-sheet';
import { getReal7155Fixture } from '@/modules/electrical-takeoff/ui/fixtures/real7155-fixture';

function hasLayoutContainment(className: string) {
  return (
    className.includes('min-w-0') &&
    (className.includes('overflow-x-hidden') || className.includes('overflow-hidden'))
  );
}

function wrap(ui: ReactNode) {
  return (
    <NextIntlClientProvider locale="he-IL" messages={{ takeoff: heTakeoff }}>
      <div dir="rtl">{ui}</div>
    </NextIntlClientProvider>
  );
}

describe('takeoff mobile overflow containment (~390px)', () => {
  beforeEach(() => {
    resetTakeoffMockStore('real7155');
  });

  it('workspace root and BOQ panel constrain horizontal overflow', async () => {
    const api = createMockTakeoffApi('real7155');
    const { container } = render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffWorkspace analysisId={REAL7155_ANALYSIS_ID} projectId={DEMO_PROJECT_ID} />
        </TakeoffApiProvider>,
      ),
    );
    await screen.findAllByTestId('takeoff-detection-row', undefined, { timeout: 15_000 });

    const workspaceRoot = container.querySelector('.flex.min-h-0.min-w-0.flex-1.flex-col.overflow-x-hidden');
    expect(workspaceRoot, 'workspace root').toBeTruthy();
    expect(hasLayoutContainment(workspaceRoot!.className)).toBe(true);
    const tokens = workspaceRoot!.className.split(/\s+/);
    expect(tokens).not.toContain('overflow-y-hidden');
    expect(tokens).not.toContain('h-[calc(100dvh-11rem)]');
    expect(tokens).toContain('lg:h-[calc(100dvh-11rem)]');
    expect(tokens).toContain('lg:overflow-y-hidden');
    const actionBar = screen.getByTestId('takeoff-action-bar');
    expect(actionBar.querySelector('.flex-wrap')).toBeTruthy();
    expect(screen.getByRole('application', { name: heTakeoff.viewer.aria })).toBeVisible();
    expect(screen.getByTestId('takeoff-boq-counting')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: heTakeoff.workspace.sideReview }));
    expect(screen.getByTestId('takeoff-review-guide')).toBeVisible();
    expect(screen.getByTestId('takeoff-guide-type')).toBeVisible();
    expect(screen.getByTestId('takeoff-guide-confirm')).toBeVisible();

    const boq = screen.getByTestId('takeoff-boq-counting').closest('div.flex');
    expect(boq?.className.includes('min-w-0')).toBe(true);
    expect(boq?.className.includes('max-w-full')).toBe(true);
  });

  it('upload wizard dialog shell uses overflow-x-hidden and min-w-0', () => {
    const api = createMockTakeoffApi('default');
    render(
      wrap(
        <TakeoffApiProvider api={api}>
          <TakeoffUploadWizard projectId={DEMO_PROJECT_ID} uploadApiBase="/api/takeoff" onClose={() => {}} onStarted={() => {}} />
        </TakeoffApiProvider>,
      ),
    );
    const shell = screen.getByRole('dialog').firstElementChild as HTMLElement | null;
    expect(shell).toBeTruthy();
    expect(hasLayoutContainment(shell!.className)).toBe(true);
  });

  it('detection sheet dialog constrains width on narrow viewports', () => {
    const { view } = getReal7155Fixture();
    const detection = view.detections[0];
    expect(detection).toBeTruthy();
    render(
      wrap(
        <TakeoffDetectionSheet
          detection={detection!}
          catalog={view.catalog}
          readOnly={false}
          reasonLabel={(r) => r}
          groupSize={1}
          onClose={() => {}}
          onCommit={() => {}}
          onSetNote={() => {}}
          onDelete={() => {}}
          onRestore={() => {}}
        />,
      ),
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('overflow-x-hidden');
    expect(dialog.className).toMatch(/max-w-\[100vw\]/);
  });
});