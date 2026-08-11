import { describe, expect, it } from 'vitest';
import { GLOBAL_SEARCH_KINDS } from '@/modules/search/domain/types';
import { globalSearchSchema } from '@/modules/search/validation/schemas';

describe('global search validation', () => {
  it('requires at least 2 characters', () => {
    expect(globalSearchSchema.safeParse({ query: 'a' }).success).toBe(false);
    expect(globalSearchSchema.safeParse({ query: 'ab' }).success).toBe(true);
  });

  it('covers expected entity kinds', () => {
    expect(GLOBAL_SEARCH_KINDS).toEqual(
      expect.arrayContaining([
        'project',
        'job',
        'work_order',
        'client',
        'contact',
        'employee',
        'vendor',
        'bill',
        'billing',
        'document',
        'asset',
      ]),
    );
  });
});
