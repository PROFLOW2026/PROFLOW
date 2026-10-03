import 'server-only';

import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import { loadAgreementValuePosition } from '@/modules/subcontracts';
import { listProjectAgreementsOperational } from '@/modules/subcontracts/data/agreements.repository';
import type { AgreementOperationalView } from '@/modules/subcontracts/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { resolveProjectSurfaceRoot } from '../domain/project-surface-path';

export interface ProjectContractorListItem {
  readonly agreement: AgreementOperationalView;
  readonly detailHref: string;
  readonly committedAmount: string | null;
  readonly currency: string | null;
}

export interface ProjectContractorListView {
  readonly items: readonly ProjectContractorListItem[];
  readonly canViewFinancial: boolean;
}

export function contractorAgreementDetailPath(
  projectId: string,
  agreementId: string,
  surfaceRoot?: string | null,
): string {
  return `${resolveProjectSurfaceRoot(projectId, surfaceRoot)}/contractors/${agreementId}`;
}

export async function loadProjectContractorList(
  context: OrgContext,
  projectId: string,
  options?: { readonly surfaceRoot?: string | null },
): Promise<ProjectContractorListView> {
  const held = await loadProjectCapabilities(context, projectId);
  const canViewFinancial = held.has(C.CONTRACT_FINANCIAL_VIEW);
  const agreements = await listProjectAgreementsOperational(context.db, context.organizationId, projectId);

  const items: ProjectContractorListItem[] = [];
  for (const agreement of agreements) {
    let committedAmount: string | null = null;
    let currency: string | null = null;
    if (canViewFinancial) {
      const position = await loadAgreementValuePosition(context.db, context.organizationId, agreement.id);
      if (position) {
        committedAmount = position.current.amount;
        currency = position.currency;
      }
    }
    items.push({
      agreement,
      detailHref: contractorAgreementDetailPath(projectId, agreement.id, options?.surfaceRoot),
      committedAmount,
      currency,
    });
  }

  return { items, canViewFinancial };
}
