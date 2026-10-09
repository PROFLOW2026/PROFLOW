import { describe, expect, it } from 'vitest';
import { taskProjectAccessCondition } from '@/modules/tasks/domain/task-project-access-filter';

describe('taskProjectAccessCondition', () => {
  it('returns undefined for full org project scope', () => {
    expect(taskProjectAccessCondition(null)).toBeUndefined();
    expect(taskProjectAccessCondition(undefined)).toBeUndefined();
  });

  it('returns SQL for restricted project lists', () => {
    expect(taskProjectAccessCondition([])).toBeDefined();
    expect(taskProjectAccessCondition(['018f1234-5678-7abc-8def-0123456789ab'])).toBeDefined();
  });
});
