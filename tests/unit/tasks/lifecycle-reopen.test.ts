import { describe, expect, it } from 'vitest';
import { transitionTask } from '@/modules/tasks/domain/lifecycle';

describe('task lifecycle reopen', () => {
  it('clears completion date when reopening from done', () => {
    const result = transitionTask('done', 'todo', { timeZone: 'Asia/Jerusalem' });
    expect(result.status).toBe('todo');
    expect(result.completionDate).toBeNull();
    expect(result.clearCompletion).toBe(true);
  });

  it('sets org-local completion date when marking done', () => {
    const result = transitionTask('in_progress', 'done', {
      timeZone: 'Asia/Jerusalem',
      now: new Date('2026-10-14T22:30:00.000Z'),
    });
    expect(result.completionDate).toBe('2026-10-15');
    expect(result.clearCompletion).toBe(false);
  });
});
