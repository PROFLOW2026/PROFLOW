/** Domain event types for project-team membership (Track A). Payload: ids only (projectId, memberId, userId). */
export const PROJECT_TEAM_DOMAIN_EVENTS = {
  MEMBER_ADDED: 'project_team.member.added',
  MEMBER_CAPABILITIES_CHANGED: 'project_team.member.capabilities_changed',
  MEMBER_DEACTIVATED: 'project_team.member.deactivated',
  MEMBER_REACTIVATED: 'project_team.member.reactivated',
} as const;
