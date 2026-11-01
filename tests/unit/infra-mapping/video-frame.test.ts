/**
 * Frame extraction from a video (the hand-off into the existing live / two-photo locate flows):
 * a JPEG file from the paused frame, nothing when no frame is available, very large videos capped.
 */
import { describe, expect, it, vi } from 'vitest';
import { MAX_FRAME_SIDE, extractVideoFrame, frameSize, type FrameCanvas } from '@/modules/infra-mapping/ui/infra-video-frame';

function fakeCanvas(blob: Blob | null = new Blob([new Uint8Array(512)], { type: 'image/jpeg' })) {
  const draw = vi.fn();
  const canvas: FrameCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: draw }),
    toBlob: (callback) => callback(blob),
  };
  return { canvas, draw };
}

const ready = { videoWidth: 1280, videoHeight: 720, readyState: 4, currentTime: 12.345 };

describe('extractVideoFrame', () => {
  it('draws the current frame at the video size and returns a JPEG file named by the time in the video', async () => {
    const { canvas, draw } = fakeCanvas();
    const file = await extractVideoFrame(ready, () => canvas);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
    expect(draw).toHaveBeenCalledWith(ready, 0, 0, 1280, 720);
    expect(file?.type).toBe('image/jpeg');
    expect(file?.name).toBe('video-frame-12345ms.jpg');
    expect(file?.size).toBe(512);
  });

  it('returns nothing when the video has no decoded frame yet', async () => {
    const { canvas } = fakeCanvas();
    expect(await extractVideoFrame({ ...ready, readyState: 1 }, () => canvas)).toBeNull();
    expect(await extractVideoFrame({ ...ready, videoWidth: 0 }, () => canvas)).toBeNull();
  });

  it('returns nothing when the canvas cannot encode (or the frame cannot be drawn)', async () => {
    expect(await extractVideoFrame(ready, () => fakeCanvas(null).canvas)).toBeNull();
    const broken = fakeCanvas();
    broken.draw.mockImplementation(() => {
      throw new Error('tainted');
    });
    expect(await extractVideoFrame(ready, () => broken.canvas)).toBeNull();
  });

  it('caps the longest side of a very large video while keeping the aspect ratio', () => {
    expect(frameSize(1280, 720)).toEqual({ width: 1280, height: 720 });
    const capped = frameSize(3840, 2160);
    expect(capped.width).toBe(MAX_FRAME_SIDE);
    expect(capped.height).toBe(Math.round((2160 * MAX_FRAME_SIDE) / 3840));
  });
});
