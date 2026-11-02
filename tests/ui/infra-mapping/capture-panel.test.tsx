// @vitest-environment jsdom
/**
 * Capture screen: the video buttons are usable as soon as the user may document - the location is
 * chosen on the item before approval (like photos), not a reason for a grey, unexplained button. The
 * work domain is a simple default that follows the item, never a lock.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/infra-mapping/ui/infra-video-file', () => ({
  inspectPickedVideo: vi.fn(async (file: File) => ({ ok: true, file, durationMs: 9_000 })),
}));
vi.mock('@/modules/infra-mapping/ui/infra-video-recorder', () => ({
  InfraVideoRecorder: () => <div data-testid="recorder-open" />,
}));
vi.mock('@/modules/infra-mapping/ui/infra-camera', () => ({ InfraCamera: () => null }));

import { InfraCapturePanel } from '@/modules/infra-mapping/ui/infra-capture-panel';
import type { InfraLocationOption } from '@/modules/infra-mapping/domain/types';
import { INFRA_TEXT } from '@/modules/infra-mapping/ui/texts';

const locations: InfraLocationOption[] = [
  { id: 'l1', parentId: null, name: 'בניין א', code: null, type: 'building', sortOrder: 0, isActive: true, archived: false },
  { id: 'l2', parentId: null, name: 'בניין ב', code: null, type: 'building', sortOrder: 1, isActive: true, archived: false },
];

function makeUploads(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    previews: {},
    videos: {},
    progress: {},
    summary: { waiting: 0, uploading: 0, failed: 0, uploaded: 0 },
    unsaved: false,
    add: vi.fn(),
    addVideo: vi.fn(),
    edit: vi.fn(),
    approve: vi.fn(),
    discard: vi.fn(),
    retry: vi.fn(),
    dismiss: vi.fn(),
    ...overrides,
  } as never;
}

function renderPanel(props: Partial<React.ComponentProps<typeof InfraCapturePanel>> = {}) {
  const uploads = makeUploads();
  render(
    <InfraCapturePanel
      locations={locations}
      locationId={null}
      onLocationChange={() => undefined}
      uploads={uploads}
      suggestions={{ rooms: [], walls: [] }}
      taskTitle={null}
      canDocument
      canCaptureVideo
      {...props}
    />,
  );
  return uploads as unknown as { addVideo: ReturnType<typeof vi.fn> };
}

afterEach(cleanup);

describe('capture panel video buttons', () => {
  it('are enabled before a location is chosen and the screen explains that the location comes before approval', () => {
    renderPanel({ locationId: null });
    expect((screen.getByTestId('infra-open-video') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId('infra-pick-video') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(INFRA_TEXT.capture.locationRequired)).toBeTruthy();
  });

  it('open the recorder without a location', () => {
    renderPanel({ locationId: null });
    fireEvent.click(screen.getByTestId('infra-open-video'));
    expect(screen.getByTestId('recorder-open')).toBeTruthy();
  });

  it('queue a picked video with no location yet, carrying the work domain', async () => {
    const uploads = renderPanel({ locationId: null, workDomain: 'plumbing' });
    const file = new File([new Uint8Array(8)], 'v.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByTestId('infra-native-video-pick'), { target: { files: [file] } });
    await waitFor(() => expect(uploads.addVideo).toHaveBeenCalled());
    expect(uploads.addVideo).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ locationId: null, source: 'gallery', details: { infraType: 'plumbing' } }),
    );
  });

  it('are not offered at all to viewers who may not record video', () => {
    renderPanel({ canCaptureVideo: false });
    expect(screen.queryByTestId('infra-open-video')).toBeNull();
  });
});

describe('capture panel work domain', () => {
  it('shows the pre-selected domain, can be changed, and has an "all domains" choice (no hard lock)', () => {
    const onWorkDomainChange = vi.fn();
    renderPanel({ workDomain: 'electrical', onWorkDomainChange });
    const select = screen.getByTestId('infra-capture-work-domain') as HTMLSelectElement;
    expect(select.value).toBe('electrical');
    fireEvent.change(select, { target: { value: 'hvac' } });
    expect(onWorkDomainChange).toHaveBeenCalledWith('hvac');
    fireEvent.change(select, { target: { value: '' } });
    expect(onWorkDomainChange).toHaveBeenLastCalledWith(null);
  });
});
