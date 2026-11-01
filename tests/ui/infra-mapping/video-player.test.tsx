// @vitest-environment jsdom
/**
 * The video player in the capture dialog: plays the video, and "use a frame for locating" hands a
 * paused frame to the EXISTING live / two-photo flows (it never saves anything by itself).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const extractVideoFrame = vi.hoisted(() => vi.fn());
vi.mock('@/modules/infra-mapping/ui/infra-video-frame', () => ({ extractVideoFrame }));

import { InfraVideoPlayer, InfraVideoThumb } from '@/modules/infra-mapping/ui/infra-video-player';

const frame = () => new File([new Uint8Array(64)], 'video-frame-3000ms.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  extractVideoFrame.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:frame'), revokeObjectURL: vi.fn() }));
  HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('InfraVideoPlayer', () => {
  it('plays the same-origin (range-capable) route with native controls', () => {
    render(<InfraVideoPlayer src="/api/dg-files/download/evidence/e1" canLocate onUseFrame={vi.fn()} />);
    const video = screen.getByTestId('infra-video-element') as HTMLVideoElement;
    expect(video.getAttribute('src')).toBe('/api/dg-files/download/evidence/e1');
    expect(video.controls).toBe(true);
  });

  it('pauses, extracts the frame and offers the live and two-photo routes', async () => {
    extractVideoFrame.mockResolvedValue(frame());
    const onUseFrame = vi.fn();
    render(<InfraVideoPlayer src="/v" canLocate onUseFrame={onUseFrame} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('infra-use-frame'));
    });
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(screen.getByTestId('infra-video-frame-choice')).toBeInTheDocument();
    expect(onUseFrame).not.toHaveBeenCalled(); // nothing is handed over before the user chooses

    fireEvent.click(screen.getByTestId('infra-frame-live'));
    fireEvent.click(screen.getByTestId('infra-frame-before'));
    fireEvent.click(screen.getByTestId('infra-frame-after'));
    expect(onUseFrame.mock.calls.map((call) => call[1])).toEqual(['live', 'before', 'after']);
    expect(onUseFrame.mock.calls[0]![0]).toBeInstanceOf(File);
    expect((onUseFrame.mock.calls[0]![0] as File).type).toBe('image/jpeg');
  });

  it('explains when no frame could be extracted and does not offer a route', async () => {
    extractVideoFrame.mockResolvedValue(null);
    render(<InfraVideoPlayer src="/v" canLocate onUseFrame={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('infra-use-frame'));
    });
    expect(screen.queryByTestId('infra-video-frame-choice')).toBeNull();
    expect(screen.getByText(/לא ניתן לחלץ תמונה/)).toBeInTheDocument();
  });

  it('hides the frame action for viewers who cannot document', () => {
    render(<InfraVideoPlayer src="/v" canLocate={false} onUseFrame={vi.fn()} />);
    expect(screen.queryByTestId('infra-use-frame')).toBeNull();
  });

  it('tells the user when the browser cannot play the video', () => {
    render(<InfraVideoPlayer src="/v" canLocate onUseFrame={vi.fn()} />);
    fireEvent.error(screen.getByTestId('infra-video-element'));
    expect(screen.getByText(/לא ניתן להפעיל את הסרטון/)).toBeInTheDocument();
  });
});

describe('InfraVideoThumb', () => {
  it('shows the video badge and duration without loading the file until it is near the screen', () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<InfraVideoThumb src="/v" durationMs={17000} label="x" />);
    expect(screen.getByText('סרטון')).toBeInTheDocument();
    expect(screen.getByText('0:17')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
  });
});
