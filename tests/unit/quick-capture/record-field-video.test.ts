import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DataHandler = ((event: { data: Blob }) => void) | null;

let lastRecorder: {
  state: 'inactive' | 'recording';
  mimeType: string;
  ondataavailable: DataHandler;
  onerror: (() => void) | null;
  onstart: (() => void) | null;
  onstop: ((event: Event) => void) | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
} | null = null;

function createMockMediaRecorder(supportedMime: string | null) {
  const isTypeSupported = vi.fn(
    (mime: string) => supportedMime !== null && mime === supportedMime,
  );

  class MockMediaRecorder {
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = supportedMime ?? 'video/webm';
    ondataavailable: DataHandler = null;
    onerror: (() => void) | null = null;
    onstart: (() => void) | null = null;
    onstop: ((event: Event) => void) | null = null;

    start = vi.fn(() => {
      this.state = 'recording';
      this.onstart?.();
    });

    stop = vi.fn(() => {
      this.state = 'inactive';
      this.onstop?.(new Event('stop'));
    });

    constructor(
      readonly stream: MediaStream,
      readonly options: {
        mimeType: string;
        videoBitsPerSecond?: number;
        audioBitsPerSecond?: number;
      },
    ) {
      lastRecorder = this;
    }

    static isTypeSupported = isTypeSupported;
  }

  return { MockMediaRecorder, isTypeSupported };
}

function installBrowserMocks(options?: { supportedMime?: string | null }) {
  lastRecorder = null;
  const supportedMime = options?.supportedMime ?? 'video/webm;codecs=vp9';
  const { MockMediaRecorder } = createMockMediaRecorder(supportedMime);

  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;

  vi.stubGlobal('window', {
    setInterval: (fn: () => void) => {
      fn();
      return 1;
    },
    clearInterval: vi.fn(),
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => stream),
    },
  });
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);

  return { stream, track };
}

describe('recordFieldVideo', () => {
  beforeEach(() => {
    vi.resetModules();
    lastRecorder = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isOptimizedRecordingSupported is false without browser APIs', async () => {
    vi.stubGlobal('window', undefined);
    const { isOptimizedRecordingSupported } = await import(
      '@/modules/quick-capture/client/record-field-video'
    );
    expect(isOptimizedRecordingSupported()).toBe(false);
  });

  it('isOptimizedRecordingSupported is true when recorder mime is available', async () => {
    installBrowserMocks();
    const { isOptimizedRecordingSupported } = await import(
      '@/modules/quick-capture/client/record-field-video'
    );
    expect(isOptimizedRecordingSupported()).toBe(true);
  });

  it('returns fallback when no recorder mime is supported', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } });
    vi.stubGlobal('MediaRecorder', { isTypeSupported: vi.fn(() => false) });

    const { recordFieldVideo } = await import('@/modules/quick-capture/client/record-field-video');

    const result = await recordFieldVideo();
    expect(result).toEqual({ kind: 'fallback' });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('starts getUserMedia + MediaRecorder when optimized recording is supported', async () => {
    installBrowserMocks();
    const { recordFieldVideo } = await import('@/modules/quick-capture/client/record-field-video');

    const result = await recordFieldVideo();
    expect(result.kind).toBe('recording');
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
        audio: true,
      }),
    );
  });

  it('stop resolves blob metadata from recorder chunks', async () => {
    installBrowserMocks();
    const { recordFieldVideo } = await import('@/modules/quick-capture/client/record-field-video');

    const result = await recordFieldVideo();
    if (result.kind !== 'recording') {
      throw new Error('expected recording session');
    }

    expect(lastRecorder).not.toBeNull();
    lastRecorder!.ondataavailable?.({
      data: new Blob([Uint8Array.from([1, 2, 3])], { type: 'video/webm' }),
    });

    const stopped = await result.stop();
    expect(stopped.mimeType).toBe('video/webm');
    expect(stopped.sizeBytes).toBeGreaterThan(0);
    expect(stopped.blob).toBeInstanceOf(Blob);
  });
});
