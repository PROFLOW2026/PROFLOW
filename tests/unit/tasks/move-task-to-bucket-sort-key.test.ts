import { describe, expect, it } from 'vitest';
import { resolveMoveSortKeyFromNeighbors } from '@/modules/tasks/application/resolve-move-sort-key';

describe('moveTaskToBucket sort key resolution', () => {
  it('places a card after neighbor A using appendAfter', () => {
    const key = resolveMoveSortKeyFromNeighbors({ afterSortKey: 'M00000000' });
    expect(key > 'M00000000').toBe(true);
  });

  it('inserts between two neighbors with insertBetween', () => {
    const key = resolveMoveSortKeyFromNeighbors({
      afterSortKey: 'M00000000',
      beforeSortKey: 'N00000000',
    });
    expect(key > 'M00000000' && key < 'N00000000').toBe(true);
  });

  it('honors explicit sortKey when provided', () => {
    expect(
      resolveMoveSortKeyFromNeighbors({
        explicitSortKey: 'custom-key',
        afterSortKey: 'M00000000',
      }),
    ).toBe('custom-key');
  });
});
