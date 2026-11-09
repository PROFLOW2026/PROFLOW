import { describe, expect, it } from 'vitest';
import { isKnownEntityType, listEntityTypes } from '@/shared/entity-access';

describe('boq_progress_batch entity access', () => {
  it('registers boq_progress_batch for evidence scope resolution', () => {
    expect(isKnownEntityType('boq_progress_batch')).toBe(true);
    expect(listEntityTypes()).toContain('boq_progress_batch');
  });
});
