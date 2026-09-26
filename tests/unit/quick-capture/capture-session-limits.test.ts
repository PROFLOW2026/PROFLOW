import { describe, expect, it } from 'vitest';
import {
  MAX_CAPTURE_IMAGES,
  validateSessionFiles,
} from '@/modules/quick-capture/domain/capture-session-limits';
import type { SessionFileInput } from '@/modules/quick-capture/domain/types';

function file(mimeType: string, fileName = 'capture'): SessionFileInput {
  return { fileName, mimeType, sizeBytes: 1024 };
}

describe('validateSessionFiles', () => {
  it('rejects an empty session', () => {
    expect(validateSessionFiles([])).toEqual({
      ok: false,
      code: 'empty',
      messageKey: 'quickCapture.errors.emptySession',
    });
  });

  it('accepts 1–5 images', () => {
    for (let count = 1; count <= MAX_CAPTURE_IMAGES; count += 1) {
      const files = Array.from({ length: count }, (_, index) =>
        file('image/jpeg', `photo-${index + 1}.jpg`),
      );
      expect(validateSessionFiles(files)).toEqual({ ok: true, sessionKind: 'images' });
    }
  });

  it('rejects more than 5 images', () => {
    const files = Array.from({ length: MAX_CAPTURE_IMAGES + 1 }, (_, index) =>
      file('image/png', `photo-${index + 1}.png`),
    );
    expect(validateSessionFiles(files)).toEqual({
      ok: false,
      code: 'too_many_images',
      messageKey: 'quickCapture.errors.tooManyImages',
    });
  });

  it('accepts exactly one video', () => {
    expect(validateSessionFiles([file('video/webm', 'field.webm')])).toEqual({
      ok: true,
      sessionKind: 'video',
    });
  });

  it('rejects more than one video file', () => {
    expect(
      validateSessionFiles([file('video/mp4', 'a.mp4'), file('video/mp4', 'b.mp4')]),
    ).toEqual({
      ok: false,
      code: 'too_many_videos',
      messageKey: 'quickCapture.errors.tooManyVideos',
    });
  });

  it('rejects mixed session modes', () => {
    expect(
      validateSessionFiles([file('image/jpeg'), file('application/pdf', 'invoice.pdf')]),
    ).toEqual({
      ok: false,
      code: 'mixed_modes',
      messageKey: 'quickCapture.errors.mixedSessionModes',
    });

    expect(validateSessionFiles([file('video/webm'), file('image/jpeg')])).toEqual({
      ok: false,
      code: 'mixed_modes',
      messageKey: 'quickCapture.errors.mixedSessionModes',
    });
  });

  it('accepts a single PDF or generic file in isolation', () => {
    expect(validateSessionFiles([file('application/pdf', 'scan.pdf')])).toEqual({
      ok: true,
      sessionKind: 'pdf',
    });
    expect(
      validateSessionFiles([
        file('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'note.docx'),
      ]),
    ).toEqual({ ok: true, sessionKind: 'file' });
  });
});
