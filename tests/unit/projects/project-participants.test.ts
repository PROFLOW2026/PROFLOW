import { describe, expect, it } from 'vitest';
import {
  formatProjectParticipantAssigneeKey,
  isProjectManagerRole,
  parseProjectParticipantAssigneeKey,
  PROJECT_MANAGER_ROLE_VALUE,
} from '@/modules/projects/domain/project-participants';

describe('project participant helpers', () => {
  it('detects project manager assignment roles', () => {
    expect(isProjectManagerRole(PROJECT_MANAGER_ROLE_VALUE)).toBe(true);
    expect(isProjectManagerRole('Project Manager')).toBe(true);
    expect(isProjectManagerRole('site lead')).toBe(true);
    expect(isProjectManagerRole('electrician')).toBe(false);
  });

  it('round-trips assignee keys', () => {
    const employeeKey = formatProjectParticipantAssigneeKey({
      employeeId: '11111111-1111-1111-1111-111111111111',
      orgMemberId: null,
    });
    expect(employeeKey).toBe('e:11111111-1111-1111-1111-111111111111');
    expect(parseProjectParticipantAssigneeKey(employeeKey)).toEqual({
      employeeId: '11111111-1111-1111-1111-111111111111',
      orgMemberId: null,
    });

    const memberKey = formatProjectParticipantAssigneeKey({
      employeeId: null,
      orgMemberId: '22222222-2222-2222-2222-222222222222',
    });
    expect(parseProjectParticipantAssigneeKey(memberKey)).toEqual({
      employeeId: null,
      orgMemberId: '22222222-2222-2222-2222-222222222222',
    });
  });
});
