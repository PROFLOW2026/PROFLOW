/**
 * Video playback needs correct partial responses (seek, Safari/iOS). Pins the headers of the
 * existing evidence download response for 200 and 206.
 */
import { describe, expect, it } from 'vitest';
import { fileResponse } from '@/modules/evidence/http';

const stream = () => new ReadableStream<Uint8Array>({ start: (controller) => controller.close() });
const base = { stream: stream(), mimeType: 'video/mp4', fileName: 'infra-video.mp4' };

describe('fileResponse for video', () => {
  it('full response: inline, Accept-Ranges and Content-Length', () => {
    const response = fileResponse({ ...base, sizeBytes: 5_000, httpStatus: 200, contentRange: null }, true);
    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe('5000');
    expect(response.headers.get('Content-Disposition')).toMatch(/^inline/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('partial response: 206 with Content-Range and the exact partial Content-Length', () => {
    const response = fileResponse({ ...base, sizeBytes: 5_000, httpStatus: 206, contentRange: 'bytes 1000-1999/5000' }, true);
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 1000-1999/5000');
    expect(response.headers.get('Content-Length')).toBe('1000');
  });

  it('open-ended range at the end of the file', () => {
    const response = fileResponse({ ...base, sizeBytes: 5_000, httpStatus: 206, contentRange: 'bytes 4000-4999/5000' }, true);
    expect(response.headers.get('Content-Length')).toBe('1000');
  });
});
