import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';

/**
 * RSC-safe clone for client tab panels. Raw `Date` instances on project / WP rows
 * break the flight boundary and surface as the generic workspace error page.
 */
export function projectDetailForClient(detail: ProjectDetail): ProjectDetail {
  return JSON.parse(JSON.stringify(detail)) as ProjectDetail;
}
