import { getComposedProjectBillingPosition } from '@/modules/financials/application/get-composed-project-billing-position';
import type { OrgContext } from '@/shared/auth/context';
import type { BillingPosition } from '@/modules/financials/domain/types';

/** Project billing tab — compose billing slice, not a second outstanding engine. */
export async function getProjectBillingPosition(
  context: OrgContext,
  projectId: string,
): Promise<BillingPosition> {
  return getComposedProjectBillingPosition(context, projectId);
}
