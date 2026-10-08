import 'server-only';

import { listProjectContractorGrantsForProject } from '@/modules/contractor-access';
import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import { listProjectAgreementsOperational, loadAgreementValuePositionsBatch } from '@/modules/subcontracts';
import type { AgreementOperationalView } from '@/modules/subcontracts/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { resolveProjectSurfaceRoot } from '../domain/project-surface-path';

export interface ContractorPortalAccessSummary {
  readonly username: string | null;
  readonly principalStatus: string;
  readonly grantStatus: string;
}

export interface ProjectContractorListItem {
  readonly agreement: AgreementOperationalView;
  readonly detailHref: string;
  readonly committedAmount: string | null;
  readonly currency: string | null;
  readonly portal: ContractorPortalAccessSummary | null;
}

export interface ProjectContractorListView {
  readonly items: readonly ProjectContractorListItem[];
  readonly canViewFinancial: boolean;
  readonly canManagePortalAccess: boolean;
  readonly contractorAccessHref: string;
}

export function contractorAgreementDetailPath(
  projectId: string,
  agreementId: string,
  surfaceRoot?: string | null,
): string {
  return `${resolveProjectSurfaceRoot(projectId, surfaceRoot)}/contractors/${agreementId}`;
}

function resolvePortalByAgreement(
  agreements: readonly AgreementOperationalView[],
  grantRows: Awaited<ReturnType<typeof listProjectContractorGrantsForProject>>,
): Map<string, ContractorPortalAccessSummary> {
  const byAgreement = new Map<string, ContractorPortalAccessSummary>();
  const byVendor = new Map<string, ContractorPortalAccessSummary>();

  for (const row of grantRows) {
    const summary: ContractorPortalAccessSummary = {
      username: row.principal.username,
      principalStatus: row.principal.status,
      grantStatus: row.grant.status,
    };
    if (row.grant.subcontractAgreementId) {
      byAgreement.set(row.grant.subcontractAgreementId, summary);
    }
    if (row.grant.vendorId && !byVendor.has(row.grant.vendorId)) {
      byVendor.set(row.grant.vendorId, summary);
    }
  }

  const resolved = new Map<string, ContractorPortalAccessSummary>();
  for (const agreement of agreements) {
    const direct = byAgreement.get(agreement.id);
    if (direct) {
      resolved.set(agreement.id, direct);
      continue;
    }
    const viaVendor = byVendor.get(agreement.vendorId);
    if (viaVendor) resolved.set(agreement.id, viaVendor);
  }
  return resolved;
}

export async function loadProjectContractorList(
  context: OrgContext,
  projectId: string,
  options?: { readonly surfaceRoot?: string | null },
): Promise<ProjectContractorListView> {
  const held = await loadProjectCapabilities(context, projectId);
  const canViewFinancial = held.has(C.CONTRACT_FINANCIAL_VIEW);
  const canManagePortalAccess = held.has(C.CONTRACTOR_INVITE) || held.has(C.EXTERNAL_ACCESS_MANAGE);
  const surfaceRoot = resolveProjectSurfaceRoot(projectId, options?.surfaceRoot);
  const contractorAccessHref = `${surfaceRoot}/contractor-access`;

  const agreements = await listProjectAgreementsOperational(context.db, context.organizationId, projectId);
  const agreementIds = agreements.map((agreement) => agreement.id);

  const [valueByAgreement, grantRows] = await Promise.all([
    canViewFinancial
      ? loadAgreementValuePositionsBatch(context.db, context.organizationId, agreementIds)
      : Promise.resolve(new Map()),
    listProjectContractorGrantsForProject(context, projectId).catch(() => []),
  ]);

  const portalByAgreement = resolvePortalByAgreement(agreements, grantRows);

  const items: ProjectContractorListItem[] = agreements.map((agreement) => {
    const position = valueByAgreement.get(agreement.id);
    return {
      agreement,
      detailHref: contractorAgreementDetailPath(projectId, agreement.id, options?.surfaceRoot),
      committedAmount: position?.current.amount ?? null,
      currency: position?.currency ?? null,
      portal: portalByAgreement.get(agreement.id) ?? null,
    };
  });

  return { items, canViewFinancial, canManagePortalAccess, contractorAccessHref };
}
