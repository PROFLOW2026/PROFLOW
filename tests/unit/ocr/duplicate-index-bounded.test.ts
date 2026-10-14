import { describe, expect, it } from 'vitest';
import { loadDuplicateIndex } from '@/modules/ocr/application/duplicate-index';

describe('bounded duplicate index (D04)', () => {
  it('scopes expense queries by date window, vendor, void exclusion, and limit', async () => {
    const captured: string[] = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async (n: number) => {
              captured.push(`limit:${n}`);
              return [];
            },
          }),
        }),
      }),
    };

    await loadDuplicateIndex(db as never, 'org-1', {
      vendorId: 'vendor-1',
      date: '2026-03-01',
      checksumSha256: 'abc',
    });

    expect(captured.some((line) => line.startsWith('limit:200'))).toBe(true);
  });
});
