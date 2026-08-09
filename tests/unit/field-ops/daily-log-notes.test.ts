import { describe, expect, it } from 'vitest';
import {
  packWorkforceAndBlockers,
  unpackWorkforceAndBlockers,
} from '@/modules/field-ops';

describe('packWorkforceAndBlockers / unpackWorkforceAndBlockers', () => {
  it('round-trips workforce and blockers', () => {
    const packed = packWorkforceAndBlockers('3 carpenters on site', 'Waiting on concrete');
    expect(packed).toContain('3 carpenters on site');
    expect(packed).toContain('Waiting on concrete');
    expect(unpackWorkforceAndBlockers(packed)).toEqual({
      workforceNotes: '3 carpenters on site',
      blockers: 'Waiting on concrete',
    });
  });

  it('stores workforce only without marker', () => {
    expect(packWorkforceAndBlockers('crew of 4', null)).toBe('crew of 4');
    expect(unpackWorkforceAndBlockers('crew of 4')).toEqual({
      workforceNotes: 'crew of 4',
      blockers: null,
    });
  });

  it('stores blockers-only with prefix', () => {
    const packed = packWorkforceAndBlockers(null, 'Access delayed');
    expect(unpackWorkforceAndBlockers(packed)).toEqual({
      workforceNotes: null,
      blockers: 'Access delayed',
    });
  });

  it('returns null when both empty', () => {
    expect(packWorkforceAndBlockers('', '  ')).toBeNull();
    expect(unpackWorkforceAndBlockers(null)).toEqual({
      workforceNotes: null,
      blockers: null,
    });
  });
});
