import { describe, expect, it } from 'vitest';
import {
  resolveHubFromTabParam,
  shouldFocusProjectContracts,
} from '@/app/[locale]/(app)/projects/[projectId]/project-hub-order';

describe('project tab contracts alias', () => {
  it('maps ?tab=contracts to details hub and section', () => {
    expect(resolveHubFromTabParam('contracts')).toEqual({
      hub: 'details',
      section: 'details',
    });
  });

  it('flags contract anchor focus for legacy links', () => {
    expect(shouldFocusProjectContracts('contracts')).toBe(true);
    expect(shouldFocusProjectContracts('details')).toBe(false);
  });
});
