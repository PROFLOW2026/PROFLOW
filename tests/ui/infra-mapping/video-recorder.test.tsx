// @vitest-environment jsdom
/**
 * The in-page recorder with a fake camera and a fake MediaRecorder: records with no minimum length,
 * stops on request, stops by itself at 30 s, records without audio at the target settings, and
 * hands the clip over for approval (nothing is uploaded from here).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfraVideoRecorder } from '@/modules/infra-mapping/ui/infra-video-recorder';

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported: (type: string) => boolean = (type) => type === 'video/webm;codecs=vp9' || type === 'video/webm';
  static isTypeSupported(type: string) {
    return FakeRecorder.supported(type);
  }
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: MediaStream,
    public options: { mimeType: string; videoBitsPerSecond: number },
  ) {
    this.mimeType = options.mimeType;
    FakeRecorder.instances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: this.mimeType }) });
    this.state = 'inactive';
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn();

async function openRecorder(onRecorded = vi.fn(), onClose = vi.fn()) {
  render(<InfraVideoRecorder onRecorded={onRecorded} onClose={onClose} />);
  await act(async () => {
    await Promise.resolve();
  });
  return { onRecorded, onClose };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  FakeRecorder.instances = [];
  FakeRecorder.supported = (type) => type === 'video/webm;codecs=vp9' || type === 'video/webm';
  track.stop.mockClear();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({ getTracks: () => [track] });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('InfraVideoRecorder', () => {
  it('asks for the rear camera at 720p without audio and records at ~1.25 Mbps in a supported container', async () => {
    await openRecorder();
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }),
      }),
    );
    fireEvent.click(screen.getByTestId('infra-video-start'));
    const recorder = FakeRecorder.instances[0]!;
    expect(recorder.options.mimeType).toBe('video/webm;codecs=vp9');
    expect(recorder.options.videoBitsPerSecond).toBe(1_250_000);
    expect(recorder.state).toBe('recording');
  });

  it('has no minimum length: a stop after one second hands over a ~1 s clip and releases the camera', async () => {
    const { onRecorded } = await openRecorder();
    fireEvent.click(screen.getByTestId('infra-video-start'));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(screen.getByTestId('infra-video-stop'));
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [file, durationMs, autoStopped] = onRecorded.mock.calls[0]!;
    expect(file.type).toBe('video/webm');
    expect(file.name).toMatch(/\.webm$/);
    expect(durationMs).toBeGreaterThanOrEqual(1000);
    expect(durationMs).toBeLessThan(1500);
    expect(autoStopped).toBe(false);
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops by itself at 30 seconds and never records longer', async () => {
    const { onRecorded } = await openRecorder();
    fireEvent.click(screen.getByTestId('infra-video-start'));
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(onRecorded).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [, durationMs, autoStopped] = onRecorded.mock.calls[0]!;
    expect(durationMs).toBeLessThanOrEqual(30_000);
    expect(durationMs).toBeGreaterThanOrEqual(29_500);
    expect(autoStopped).toBe(true);
    expect(FakeRecorder.instances[0]!.state).toBe('inactive');
  });

  it('prefers MP4 when the browser can record it', async () => {
    FakeRecorder.supported = () => true;
    const { onRecorded } = await openRecorder();
    fireEvent.click(screen.getByTestId('infra-video-start'));
    expect(FakeRecorder.instances[0]!.options.mimeType).toBe('video/mp4;codecs=avc1.42E01E');
    fireEvent.click(screen.getByTestId('infra-video-stop'));
    expect(onRecorded.mock.calls[0]![0].type).toBe('video/mp4');
  });

  it('closing while recording drops the clip (nothing is handed over)', async () => {
    const { onRecorded } = await openRecorder();
    fireEvent.click(screen.getByTestId('infra-video-start'));
    cleanup();
    expect(onRecorded).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('shows clear Hebrew messages for denied permission, no camera and an unsupported browser', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await openRecorder();
    expect(screen.getByTestId('infra-video-error').textContent).toContain('אין הרשאה למצלמה');
    cleanup();

    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFoundError' }));
    await openRecorder();
    expect(screen.getByTestId('infra-video-error').textContent).toContain('לא נמצאה מצלמה');
    cleanup();

    FakeRecorder.supported = () => false;
    await openRecorder();
    expect(screen.getByTestId('infra-video-error').textContent).toContain('לא תומך');
  });
});
