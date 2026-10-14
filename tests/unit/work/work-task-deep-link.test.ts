import { describe, expect, it } from 'vitest';
import { extractMentionOrgMemberIds } from '@/modules/tasks/domain/comment-mentions';

/** Deep-link contract: /work?task=<uuid> is consumed by MyWorkView (see my-work-view.tsx). */
describe('work task deep link contract', () => {
  it('task query key is independent of mention tokens', () => {
    const taskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const params = new URLSearchParams({ task: taskId, view: 'today' });
    expect(params.get('task')).toBe(taskId);
    expect(extractMentionOrgMemberIds(`@[${taskId}]`)).toEqual([taskId]);
  });
});
