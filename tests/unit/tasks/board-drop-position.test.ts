import { describe, expect, it } from 'vitest';
import {
  computeAfterTaskIdForInsert,
  computeProvisionalSortKey,
  resolveBoardGroupDropKind,
  resolveStatusOnBucketEnter,
} from '@/modules/tasks/ui/board-drop-position';

describe('board drop position', () => {
  it('insert between A and B yields afterTaskId=A', () => {
    expect(computeAfterTaskIdForInsert(['A', 'B', 'C'], 'X', 'B')).toBe('A');
  });

  it('append to column yields afterTaskId of last task', () => {
    expect(computeAfterTaskIdForInsert(['A', 'B'], 'X', null)).toBe('B');
  });

  it('prepend before first task yields afterTaskId=null', () => {
    expect(computeAfterTaskIdForInsert(['A', 'B'], 'X', 'A')).toBe(null);
  });

  it('reorder within column ignores dragged task when computing neighbors', () => {
    expect(computeAfterTaskIdForInsert(['A', 'B', 'C'], 'B', 'C')).toBe('A');
  });
});

describe('bucket status on enter', () => {
  it('applies status when lifecycle allows', () => {
    expect(resolveStatusOnBucketEnter('todo', 'in_progress')).toBe('in_progress');
  });

  it('skips invalid transitions', () => {
    expect(resolveStatusOnBucketEnter('blocked', 'done')).toBeUndefined();
  });

  it('skips when already at target status', () => {
    expect(resolveStatusOnBucketEnter('done', 'done')).toBeUndefined();
  });
});

describe('provisional sort key', () => {
  const tasks = [
    { id: 'A', sortKey: 'M100' },
    { id: 'B', sortKey: 'M200' },
  ];

  it('prepend before first neighbor', () => {
    const key = computeProvisionalSortKey(tasks, null);
    expect(key < 'M100').toBe(true);
  });

  it('insert after A and before B', () => {
    const key = computeProvisionalSortKey(tasks, 'A');
    expect(key > 'M100' && key < 'M200').toBe(true);
  });
});

describe('board group-by drop routing', () => {
  it('assignee grouping uses reassign not bucket move', () => {
    expect(resolveBoardGroupDropKind('assignee')).toBe('reassign');
    expect(resolveBoardGroupDropKind('bucket')).toBe('move');
  });

  it('label grouping disables drag reorder', () => {
    expect(resolveBoardGroupDropKind('label')).toBe('disabled');
  });
});
