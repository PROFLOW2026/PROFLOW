import type { ProjectFinancials } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { getProjectFinancials } from './get-project-financials';

/**
 * Overview financial snapshot — same full compose truth as project Financials.
 * Do not partial-compose with null labor/AP/commit (false-zero class).
 */
export async function getProjectFinancialsOverviewSnapshot(
  context: OrgContext,
  projectId: string,
): Promise<ProjectFinancials> {
  return getProjectFinancials(context, projectId);
}
