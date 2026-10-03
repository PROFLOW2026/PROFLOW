import 'server-only';

import { findProjectDeliveryProfile } from '@/modules/project-profile';
import { loadProjectCapabilities } from '@/modules/project-team';
import { listProjectAgreementsOperational } from '@/modules/subcontracts/data/agreements.repository';
import type { OrgContext } from '@/shared/auth/context';
import {
  selectExecutionNavLinks,
  shouldShowExecutionNavGroup,
  type ExecutionNavLink,
} from '../domain/select-execution-nav-links';

export interface ProjectExecutionNavView {
  readonly showGroup: boolean;
  readonly links: readonly ExecutionNavLink[];
}

export async function loadProjectExecutionNav(
  context: OrgContext,
  projectId: string,
  options?: { readonly surfaceRoot?: string },
): Promise<ProjectExecutionNavView> {
  const [capabilities, deliveryProfile, agreements] = await Promise.all([
    loadProjectCapabilities(context, projectId),
    findProjectDeliveryProfile(context, projectId),
    listProjectAgreementsOperational(context.db, context.organizationId, projectId).catch(() => []),
  ]);

  const hasSubcontractAgreements = agreements.length > 0;
  const showGroup = shouldShowExecutionNavGroup({ deliveryProfile, hasSubcontractAgreements });
  if (!showGroup) {
    return { showGroup: false, links: [] };
  }

  const fallbackContractorAgreementId = agreements[0]?.id ?? null;
  const links = selectExecutionNavLinks({
    projectId,
    capabilities,
    deliveryProfile,
    hasSubcontractAgreements,
    fallbackContractorAgreementId,
    surfaceRoot: options?.surfaceRoot,
  });

  return { showGroup: links.length > 0, links };
}
