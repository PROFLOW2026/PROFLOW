/**
 * Still frame of a playing / paused video, as a JPEG file. Used to hand a frame from a recorded
 * video to the EXISTING locate flows (live camera / two-photo comparison) exactly like any other
 * photo. Nothing is uploaded or saved here: the frame stays in memory until the user chooses to
 * save a comparison.
 */

/** Longest side of the extracted frame (keeps very large phone videos manageable). */
export const MAX_FRAME_SIDE = 2560;

export interface FrameCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): { drawImage(source: unknown, x: number, y: number, w: number, h: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void;
}

export interface FrameSource {
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
  readonly currentTime: number;
}

export function frameSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_FRAME_SIDE) return { width, height };
  const scale = MAX_FRAME_SIDE / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function extractVideoFrame(
  video: FrameSource,
  createCanvas: () => FrameCanvas = () => document.createElement('canvas') as unknown as FrameCanvas,
): Promise<File | null> {
  // HAVE_CURRENT_DATA (2) or more: a frame is actually available.
  if (video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  const size = frameSize(video.videoWidth, video.videoHeight);
  const canvas = createCanvas();
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, size.width, size.height);
  } catch {
    return null;
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob || blob.size === 0) return null;
  return new File([blob], `video-frame-${Math.round(video.currentTime * 1000)}ms.jpg`, { type: 'image/jpeg' });
}
