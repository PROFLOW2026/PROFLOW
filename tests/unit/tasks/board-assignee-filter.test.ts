import { describe, expect, it } from 'vitest';
import {
  assigneeKeyFromBoardQuery,
  boardQueryPatchForAssigneeKey,
} from '@/modules/tasks/domain/board-assignee-filter';

describe('board assignee filter URL helpers', () => {
  it('round-trips org member keys', () => {
    const query = { assigneeOrgMemberId: 'mem-1' };
    expect(assigneeKeyFromBoardQuery(query)).toBe('m:mem-1');
    expect(boardQueryPatchForAssigneeKey('m:mem-1')).toEqual({
      assigneeOrgMemberId: 'mem-1',
      assigneeEmployeeId: undefined,
    });
  });

  it('round-trips employee keys', () => {
    const query = { assigneeEmployeeId: 'emp-9' };
    expect(assigneeKeyFromBoardQuery(query)).toBe('e:emp-9');
    expect(boardQueryPatchForAssigneeKey('e:emp-9')).toEqual({
      assigneeEmployeeId: 'emp-9',
      assigneeOrgMemberId: undefined,
    });
  });
});
