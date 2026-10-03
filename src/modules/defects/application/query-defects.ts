import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { profiles, qualityInspectionOutcomes, qualityInspections } from '@drizzle/schema';
import {
  assertProjectCapability,
  listProjectTeam,
  loadProjectCapabilities,
  PROJECT_CAPABILITIES,
  type ProjectCapability,
} from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import {
  countDefectsByStatus,
  findDefectRow,
  listAwaitingVerificationRows,
  listDefectRows,
  listDefectsForMetrics,
  loadDefectDetail,
} from '../data/defects.repository';
import { loadQualityFormOptions, type QualityFormOptions } from '../data/quality-refs.repository';
import { allowedDefectActions, type DefectAction } from '../domain/lifecycle';
import { computeContractorQualityMetrics, type ContractorQualityMetrics } from '../domain/metrics';
import type {
  DefectAwaitingVerificationItem,
  DefectDetail,
  DefectListFilters,
  DefectListPage,
  DefectStatusCounts,
} from '../domain/types';
import { DEFECT_VERIFY_CAPABILITIES } from './manage-defects';

const C = PROJECT_CAPABILITIES;

function today(context: OrgContext): string {
  return todayInTimeZone(context.organization.timezone);
}

export interface DefectPermissions {
  readonly manage: boolean;
  readonly verify: boolean;
  readonly create: boolean;
}

function permissionsFrom(held: ReadonlySet<ProjectCapability>): DefectPermissions {
  return {
    manage: held.has(C.DEFECTS_MANAGE),
    verify: DEFECT_VERIFY_CAPABILITIES.some((capability) => held.has(capability)),
    create: held.has(C.DEFECTS_MANAGE) || held.has(C.QUALITY_MANAGE),
  };
}

export async function getDefectPermissions(context: OrgContext, projectId: string): Promise<DefectPermissions> {
  return permissionsFrom(await loadProjectCapabilities(context, projectId));
}

export async function listProjectDefects(
  context: OrgContext,
  projectId: string,
  filters: DefectListFilters = {},
): Promise<DefectListPage> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return listDefectRows(
    context.db,
    { organizationId: context.organizationId, projectId },
    filters,
    'internal',
    today(context),
  );
}

export async function countProjectDefects(context: OrgContext, projectId: string): Promise<DefectStatusCounts> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return countDefectsByStatus(context.db, { organizationId: context.organizationId, projectId }, today(context));
}

export interface DefectDetailView {
  readonly defect: DefectDetail;
  readonly permissions: DefectPermissions;
  readonly allowedActions: readonly DefectAction[];
}

export async function getDefectDetail(
  context: OrgContext,
  projectId: string,
  defectId: string,
): Promise<DefectDetailView> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const row = await findDefectRow(context.db, context.organizationId, defectId);
  if (!row || row.projectId !== projectId) throw new NotFoundError('defect');
  const permissions = await getDefectPermissions(context, projectId);
  return {
    defect: await loadDefectDetail(context.db, row, 'internal', today(context)),
    permissions,
    allowedActions: allowedDefectActions(row.status),
  };
}

export interface QualityPersonOption {
  readonly userId: string;
  readonly name: string;
}

export interface QualityFormData extends QualityFormOptions {
  readonly people: readonly QualityPersonOption[];
}

/** Option lists for inspection / defect forms (operational only, no money). */
export async function loadQualityFormData(context: OrgContext, projectId: string): Promise<QualityFormData> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const options = await loadQualityFormOptions(context.db, context.organizationId, projectId);
  const team = await listProjectTeam(context, projectId);
  const people = new Map<string, string>();
  for (const member of team) {
    if (member.status === 'active') people.set(member.userId, member.displayName ?? member.email);
  }
  if (!people.has(context.userId)) {
    const [self] = await context.db
      .select({ displayName: profiles.displayName, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, context.userId))
      .limit(1);
    if (self) people.set(context.userId, self.displayName ?? self.email);
  }
  return { ...options, people: [...people.entries()].map(([userId, name]) => ({ userId, name })) };
}

/**
 * Command Center source (Track T): defects whose completion was submitted and wait for an internal
 * verifier. Only projects where the caller can verify (progress.verify / defects.manage).
 */
export async function listDefectsAwaitingVerification(
  context: OrgContext,
  options: {
    readonly projectId?: string | null;
    readonly projectIds?: readonly string[] | null;
    readonly limit?: number;
    readonly locale?: string;
  } = {},
): Promise<readonly DefectAwaitingVerificationItem[]> {
  if (options.projectIds && options.projectIds.length === 0) return [];
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const rows = await listAwaitingVerificationRows(
    context.db,
    context.organizationId,
    options.projectId ?? null,
    limit * 3,
    options.projectIds,
  );
  const projectIds = [...new Set(rows.map((row) => row.projectId))];
  const canVerify = new Map<string, boolean>();
  for (const projectId of projectIds) {
    const held = await loadProjectCapabilities(context, projectId);
    canVerify.set(projectId, DEFECT_VERIFY_CAPABILITIES.some((capability) => held.has(capability)));
  }
  const locale = options.locale ?? context.locale;
  return rows
    .filter((row) => canVerify.get(row.projectId))
    .slice(0, limit)
    .map((row) => ({
      defectId: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      referenceNo: row.referenceNo,
      title: row.title,
      severity: row.severity,
      status: row.status,
      cycleNo: row.cycleNo,
      vendorName: row.vendorName,
      submittedAt: row.lastSubmittedAt,
      href: `/${locale}/projects/${row.projectId}/defects/${row.id}`,
    }));
}

/**
 * Per-contractor quality metrics (Track Q performance, Contractor 360). Operational only.
 * With `projectId`: requires contractor.view on that project. Without: organization-wide over the
 * projects RLS lets the caller see.
 */
export async function getContractorQualityMetrics(
  context: OrgContext,
  input: { readonly vendorId: string; readonly projectId?: string | null },
): Promise<ContractorQualityMetrics> {
  const batch = await getContractorQualityMetricsBatch(context, {
    vendorIds: [input.vendorId],
    projectId: input.projectId,
  });
  return batch.get(input.vendorId)!;
}

/** Batch variant for lists (Contractor 360 / performance tables). Two queries regardless of vendor count. */
export async function getContractorQualityMetricsBatch(
  context: OrgContext,
  input: { readonly vendorIds: readonly string[]; readonly projectId?: string | null },
): Promise<ReadonlyMap<string, ContractorQualityMetrics>> {
  const result = new Map<string, ContractorQualityMetrics>();
  const vendorIds = [...new Set(input.vendorIds)].slice(0, 200);
  if (vendorIds.length === 0) return result;
  const projectId = input.projectId ?? null;
  if (projectId) await assertProjectCapability(context, projectId, C.CONTRACTOR_VIEW);

  const inspectionConditions: SQL[] = [
    eq(qualityInspections.organizationId, context.organizationId),
    inArray(qualityInspections.vendorId, vendorIds),
    isNull(qualityInspections.archivedAt),
  ];
  if (projectId) inspectionConditions.push(eq(qualityInspections.projectId, projectId));
  const outcomes = await context.db
    .select({
      vendorId: qualityInspections.vendorId,
      attemptNo: qualityInspectionOutcomes.attemptNo,
      outcome: qualityInspectionOutcomes.outcome,
    })
    .from(qualityInspectionOutcomes)
    .innerJoin(
      qualityInspections,
      and(
        eq(qualityInspections.id, qualityInspectionOutcomes.inspectionId),
        eq(qualityInspections.organizationId, qualityInspectionOutcomes.organizationId),
      ),
    )
    .where(and(...inspectionConditions))
    .limit(20000);

  const defectRows = await listDefectsForMetrics(context.db, context.organizationId, vendorIds, projectId);

  const day = today(context);
  for (const vendorId of vendorIds) {
    result.set(
      vendorId,
      computeContractorQualityMetrics(
        outcomes.filter((row) => row.vendorId === vendorId),
        defectRows.filter((row) => row.vendorId === vendorId),
        day,
      ),
    );
  }
  return result;
}
