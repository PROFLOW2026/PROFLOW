/**
 * Browser side of the "numbered reference picture" for the second phone: a tiny JPEG of the source photo,
 * made on the broadcasting phone itself. The viewer never receives the original or any storage address.
 */

import type { InfraLiveReference } from '@/modules/project-workspace/ui/infra-trial-integration';
import { LIVE_CONTROL } from '../domain/live-control';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function render(image: HTMLImageElement, maxSide: number, quality: number): string | null {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

/** A JPEG data URL small enough to travel as a few data-channel packets, or null when it cannot be made. */
export async function buildReferenceDataUrl(reference: InfraLiveReference | null): Promise<string | null> {
  if (!reference) return null;
  const image = await loadImage(reference.url);
  if (!image || image.naturalWidth === 0) return null;
  for (const [side, quality] of [
    [LIVE_CONTROL.referenceMaxSide, 0.6],
    [LIVE_CONTROL.referenceMaxSide, 0.45],
    [160, 0.45],
  ] as const) {
    const dataUrl = render(image, side, quality);
    if (dataUrl && dataUrl.length <= LIVE_CONTROL.maxReferenceChars) return dataUrl;
  }
  return null;
}
