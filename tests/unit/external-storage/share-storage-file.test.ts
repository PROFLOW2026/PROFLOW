import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canShareFilesViaWebShare,
  shareStorageFile,
} from '@/modules/external-storage/client/share-storage-file';

describe('share storage file', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('detects missing Web Share file support', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareFilesViaWebShare()).toBe(false);
  });

  it('shares file bytes via Web Share when supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    }));
    vi.stubGlobal('navigator', { share, canShare });

    const result = await shareStorageFile({
      downloadUrl: '/api/org-storage/browser-download?scope=org&fileId=f1',
      filename: 'drawing.pdf',
      mimeType: 'application/pdf',
    });

    expect(result).toEqual({ ok: true, method: 'web_share' });
    expect(fetch).toHaveBeenCalledWith(
      '/api/org-storage/browser-download?scope=org&fileId=f1',
      { method: 'GET', credentials: 'include' },
    );
    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalledOnce();
    const payload = share.mock.calls[0]?.[0] as { files: File[] };
    expect(payload.files[0]?.name).toBe('drawing.pdf');
  });

  it('returns unsupported when canShare rejects files', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    }));
    vi.stubGlobal('navigator', {
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(false),
    });

    const result = await shareStorageFile({
      downloadUrl: '/api/org-storage/browser-download?scope=org&fileId=f1',
      filename: 'drawing.pdf',
      mimeType: 'application/pdf',
    });

    expect(result).toEqual({ ok: false, reason: 'unsupported' });
  });
});
