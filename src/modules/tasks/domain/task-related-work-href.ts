/** Deep links for Related work entries on task detail (entity_links + schedule). */
export function hrefForRelatedEntity(
  entityType: string,
  entityId: string,
  projectId: string | null,
): string | null {
  switch (entityType) {
    case 'rfi':
      return projectId ? `/projects/${projectId}/rfi/${entityId}` : null;
    case 'submittal':
      return projectId ? `/projects/${projectId}/submittals/${entityId}` : null;
    case 'site_instruction':
      return projectId ? `/projects/${projectId}/instructions/${entityId}` : null;
    case 'defect':
      return projectId ? `/projects/${projectId}/defects/${entityId}` : null;
    case 'inspection':
      return projectId ? `/projects/${projectId}/inspections/${entityId}` : null;
    case 'coordination_event':
      return projectId ? `/projects/${projectId}/coordination/${entityId}` : null;
    case 'punch_list_item':
      return `/field-ops/punch/${entityId}`;
    case 'site_meeting':
      return projectId ? `/projects/${projectId}/site-meetings/${entityId}` : null;
    case 'meeting_action_item':
      return null;
    case 'task':
      return `/tasks/${entityId}`;
    case 'planning_work_item':
      return projectId ? `/projects/${projectId}?tab=schedule` : null;
    default:
      return projectId ? `/projects/${projectId}` : null;
  }
}
