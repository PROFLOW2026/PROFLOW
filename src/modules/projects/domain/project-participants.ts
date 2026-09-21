/** Role markers stored on `employee_project_assignments.role` for PM / responsible. */
export const PROJECT_MANAGER_ROLE_VALUE = 'project_manager';

const PROJECT_MANAGER_ROLE_MARKERS = [
  PROJECT_MANAGER_ROLE_VALUE,
  'project manager',
  'pm',
  'manager',
  'site lead',
  'מנהל',
  'מנהל פרויקט',
] as const;

export function isProjectManagerRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const normalized = role.trim().toLowerCase().replace(/_/g, ' ');
  return PROJECT_MANAGER_ROLE_MARKERS.some((marker) =>
    normalized.includes(marker.replace(/_/g, ' ')),
  );
}

export interface TaskAssigneeActor {
  readonly employeeId?: string | null;
  readonly orgMemberId?: string | null;
}

export function formatProjectParticipantAssigneeKey(participant: {
  employeeId: string | null;
  orgMemberId: string | null;
}): string {
  if (participant.employeeId) return `e:${participant.employeeId}`;
  if (participant.orgMemberId) return `m:${participant.orgMemberId}`;
  throw new Error('Participant must have employeeId or orgMemberId');
}

export function parseProjectParticipantAssigneeKey(key: string): TaskAssigneeActor {
  if (key.startsWith('e:')) return { employeeId: key.slice(2), orgMemberId: null };
  if (key.startsWith('m:')) return { orgMemberId: key.slice(2), employeeId: null };
  throw new Error('Invalid assignee key');
}
