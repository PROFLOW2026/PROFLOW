import { describe, expect, it } from 'vitest';
import { validateSessionFiles } from '@/modules/quick-capture/domain/capture-session-limits';
import type { SessionFileInput } from '@/modules/quick-capture/domain/types';

function file(mimeType: string, fileName: string): SessionFileInput {
  return { fileName, mimeType, sizeBytes: 2048 };
}

describe('video session composition', () => {
  it('rejects video combined with images', () => {
    expect(
      validateSessionFiles([
        file('video/webm', 'site-walk.webm'),
        file('image/jpeg', 'still.jpg'),
      ]),
    ).toEqual({
      ok: false,
      code: 'mixed_modes',
      messageKey: 'quickCapture.errors.mixedSessionModes',
    });
  });

  it('rejects video combined with PDF', () => {
    expect(
      validateSessionFiles([
        file('video/mp4', 'progress.mp4'),
        file('application/pdf', 'permit.pdf'),
      ]),
    ).toEqual({
      ok: false,
      code: 'mixed_modes',
      messageKey: 'quickCapture.errors.mixedSessionModes',
    });
  });

  it('accepts a lone video file', () => {
    expect(validateSessionFiles([file('video/webm', 'lone.webm')])).toEqual({
      ok: true,
      sessionKind: 'video',
    });
  });
});
