import { and, eq, inArray } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { addDays, daysBetween } from '../domain/status';
import type { ComplianceRequirementKind } from '../domain/types';
import {
  listApprovedDocumentsForRequirements,
  listExpiryCandidates,
  listRequirements,
} from '../data/compliance.repository';
import { organizationToday } from './internal';

export interface ExpiringComplianceItem {
  readonly documentId: string;
  readonly requirementId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly agreementId: string;
  readonly kind: ComplianceRequirementKind;
  readonly title: string;
  readonly status: 'expiring' | 'expired';
  readonly expiresOn: string;
  readonly daysToExpiry: number;
}

/**
 * Command Center feed (Track T): compliance documents expiring within their warning window or
 * already expired, across the projects the caller can see. Uses the caller's RLS-bound executor
 * (rows of projects without `contractor.view` are invisible). Indexed by approved expiry date.
 */
export async function listExpiringComplianceForOrg(
  context: OrgContext,
  options: {
    readonly projectId?: string;
    readonly projectIds?: readonly string[];
    readonly requiredOnly?: boolean;
    readonly limit?: number;
    readonly today?: string;
  } = {},
): Promise<readonly ExpiringComplianceItem[]> {
  if (options.projectIds && options.projectIds.length === 0) return [];
  const today = options.today ?? organizationToday(context);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const candidates = await listExpiryCandidates(context.db, {
    horizon: addDays(today, 365),
    organizationId: context.organizationId,
    projectId: options.projectId,
    projectIds: options.projectIds,
    requiredOnly: options.requiredOnly,
    limit: 1_000,
  });
  const requirementIds = [...new Set(candidates.map((row) => row.requirementId))];
  const approved = await listApprovedDocumentsForRequirements(context.db, requirementIds);
  const effective = candidates.filter((candidate) => {
    if (daysBetween(today, candidate.expiresOn) > candidate.warningDays) return false;
    return !approved.some(
      (other) =>
        other.requirementId === candidate.requirementId &&
        other.id !== candidate.documentId &&
        (other.expiresOn === null || other.expiresOn > candidate.expiresOn),
    );
  });
  const selected = effective.slice(0, limit);
  if (selected.length === 0) return [];

  const requirements = await listRequirements(context.db, context.organizationId, {
    ids: [...new Set(selected.map((row) => row.requirementId))],
  });
  const requirementTitle = new Map(requirements.map((row) => [row.id, row.title]));
  const vendorRows = await context.db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, context.organizationId),
        inArray(vendors.id, [...new Set(selected.map((row) => row.vendorId))]),
      ),
    );
  const vendorName = new Map(vendorRows.map((row) => [row.id, row.name]));

  return selected.map((row) => {
    const daysToExpiry = daysBetween(today, row.expiresOn);
    return {
      documentId: row.documentId,
      requirementId: row.requirementId,
      projectId: row.projectId,
      vendorId: row.vendorId,
      vendorName: vendorName.get(row.vendorId) ?? '',
      agreementId: row.subcontractAgreementId,
      kind: row.kind,
      title: requirementTitle.get(row.requirementId) ?? row.kind,
      status: daysToExpiry < 0 ? 'expired' : 'expiring',
      expiresOn: row.expiresOn,
      daysToExpiry,
    };
  });
}
