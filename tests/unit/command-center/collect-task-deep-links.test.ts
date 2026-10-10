import { describe, expect, it } from 'vitest';
import { resolveTaskDeepLink } from '@/modules/command-center/data/collect-tasks';

describe('resolveTaskDeepLink', () => {
  it('uses owner task route by default', () => {
    expect(resolveTaskDeepLink(false, 'abc-123')).toBe('/tasks/abc-123');
  });

  it('uses employee task route for employee app users', () => {
    expect(resolveTaskDeepLink(true, 'abc-123')).toBe('/employee/tasks/abc-123');
  });

  it('appends approvals tab query for employee approvers', () => {
    expect(resolveTaskDeepLink(true, 'abc-123', { tab: 'approvals' })).toBe(
      '/employee/tasks/abc-123?tab=approvals',
    );
  });
});
