import { describe, expect, it } from 'vitest';
import type { PlanningWorkItem } from '@/modules/planning/domain/types';
import {
  assertBaselineSnapshotImmutableOp,
  buildBaselineItemsFromWorkItems,
  compareBaselineToCurrent,
  isBaselineSnapshotImmutableOp,
} from '@/modules/planning/domain/baseline-snapshot';

const baseItem = (overrides: Partial<PlanningWorkItem> = {}): PlanningWorkItem => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  name: 'Pour slab',
  kind: 'task',
  startDate: '2026-01-01',
  targetEndDate: '2026-01-10',
  actualEndDate: null,
  progressPercent: 20,
  phaseId: null,
  workPackageId: null,
  taskId: null,
  sortOrder: 0,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('baseline snapshot helpers', () => {
  it('blocks update/delete mutation ops', () => {
    expect(isBaselineSnapshotImmutableOp('update')).toBe(true);
    expect(isBaselineSnapshotImmutableOp('delete')).toBe(true);
    expect(() => assertBaselineSnapshotImmutableOp('update')).toThrow(/immutable/i);
    expect(() => assertBaselineSnapshotImmutableOp('delete')).toThrow(/immutable/i);
  });

  it('snapshots active work items only', () => {
    const items = buildBaselineItemsFromWorkItems([
      baseItem(),
      baseItem({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', archivedAt: new Date() }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.workItemId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('compares baseline vs current dates in days', () => {
    const baseline = buildBaselineItemsFromWorkItems([baseItem()]);
    const current = [
      baseItem({
        startDate: '2026-01-03',
        targetEndDate: '2026-01-12',
      }),
    ];
    const rows = compareBaselineToCurrent(baseline, current);
    expect(rows[0]?.startDeltaDays).toBe(2);
    expect(rows[0]?.targetEndDeltaDays).toBe(2);
  });
});
