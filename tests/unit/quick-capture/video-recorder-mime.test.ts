import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickRecorderMimeType } from '@/modules/quick-capture/domain/video-mime';

describe('pickRecorderMimeType', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn(() => false),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when MediaRecorder is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(pickRecorderMimeType()).toBeNull();
  });

  it('returns null when no candidate mime is supported', () => {
    expect(pickRecorderMimeType()).toBeNull();
  });

  it('returns the first supported candidate in priority order', () => {
    const isTypeSupported = vi.fn(
      (mime: string) => mime === 'video/webm;codecs=vp9' || mime === 'video/webm',
    );
    vi.stubGlobal('MediaRecorder', { isTypeSupported });

    expect(pickRecorderMimeType()).toBe('video/webm;codecs=vp9');
    expect(isTypeSupported).toHaveBeenCalledWith('video/mp4;codecs=avc1');
    expect(isTypeSupported).toHaveBeenCalledWith('video/mp4');
    expect(isTypeSupported).toHaveBeenCalledWith('video/webm;codecs=vp9');
  });

  it('prefers mp4 when the browser supports it first', () => {
    const isTypeSupported = vi.fn((mime: string) => mime.startsWith('video/mp4'));
    vi.stubGlobal('MediaRecorder', { isTypeSupported });

    expect(pickRecorderMimeType()).toBe('video/mp4;codecs=avc1');
  });
});
