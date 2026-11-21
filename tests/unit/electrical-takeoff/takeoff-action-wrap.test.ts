import { describe, expect, it } from 'vitest';
import { wrapTakeoffAction } from '@/modules/electrical-takeoff/ui/takeoff-action-wrap';
import { takeoffErrorCode } from '@/modules/electrical-takeoff/ui/takeoff-errors';

describe('wrapTakeoffAction catalog failures', () => {
  it('converts a returned catalog_duplicate into a client error without a digest overlay', async () => {
    await expect(
      wrapTakeoffAction(async () => ({
        ok: false as const,
        code: 'catalog_duplicate' as const,
        message: 'שם האביזר כבר קיים בארגון. בחרו שם אחר.',
      })),
    ).rejects.toMatchObject({
      takeoffCode: 'catalog_duplicate',
      message: 'שם האביזר כבר קיים בארגון. בחרו שם אחר.',
    });
  });

  it('reads catalog_duplicate from the Hebrew duplicate sentence', () => {
    expect(takeoffErrorCode(new Error('שם האביזר כבר קיים בארגון. בחרו שם אחר.'))).toBe('catalog_duplicate');
  });
});
