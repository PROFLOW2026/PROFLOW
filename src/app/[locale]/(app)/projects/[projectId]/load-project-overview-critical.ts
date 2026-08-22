import type { OrgContext } from '@/shared/auth/context';
import { getProjectOverviewPayload } from '@/modules/projects/application/get-project-overview-payload';
import type { ProjectDetailChrome } from '@/modules/projects';
import type { ProjectFinancials } from '@/modules/financials/domain/types';

/**
 * Above-fold overview payload: contract chrome + financial snapshot inputs.
 * Secondary panels (contracts list, next-gen, structure) stream separately.
 */
export async function loadProjectOverviewCritical(
  context: OrgContext,
  projectId: string,
): Promise<{
  detail: ProjectDetailChrome;
  financials: ProjectFinancials | null;
  canReadProfit: boolean;
}> {
  return getProjectOverviewPayload(context, projectId);
}
