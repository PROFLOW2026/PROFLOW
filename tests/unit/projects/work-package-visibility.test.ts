import { describe, expect, it } from 'vitest';
import { countActiveWorkPackages, shouldShowWorkPackages } from '@/modules/projects';

describe('work package visibility', () => {
  it('hides UI when only the default package exists', () => {
    expect(shouldShowWorkPackages(1)).toBe(false);
  });

  it('reveals UI when multiple packages exist', () => {
    expect(shouldShowWorkPackages(2)).toBe(true);
  });

  it('counts only non-archived packages', () => {
    const count = countActiveWorkPackages([
      { archivedAt: null },
      { archivedAt: new Date() },
      { archivedAt: null },
    ]);
    expect(count).toBe(2);
  });
});
