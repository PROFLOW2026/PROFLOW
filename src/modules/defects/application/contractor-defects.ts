import { and, count, eq, gte, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { qualityInspections } from '@drizzle/schema';
import { listEvidence } from '@/modules/evidence';
import { externalActor } from '@/shared/actor';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES,
  requireExternalScope,
  type ExternalCapability,
  type ExternalContext,
} from '@/shared/external';
import {
  countDefectsByStatus,
  findDefectRow,
  insertCycleRecord,
  listCycleRecords,
  listDefectRows,
  loadDefectDetail,
  updateDefectRow,
  type DefectRow,
} from '../data/defects.repository';
import {
  countCycleEvidence,
  currentCycleStartedAt,
  planDefectStep,
  type DefectStatusFilter,
} from '../domain/lifecycle';
import type { ContractorQualitySummary, DefectDetail, DefectListPage } from '../domain/types';
import { noteSchema, parseOrThrow, type DefectNoteInput } from '../validation/schemas';

/**
 * Contractor (external principal) side of defects. Every call starts with the grant check;
 * queries run on the principal's RLS-bound executor, so contractor A never sees contractor B.
 */

const X = EXTERNAL_CAPABILITIES;

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Vendor ids whose grants cover `projectId` with `capability` (organization-scoped). */
export function externalVendorsFor(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  capability: ExternalCapability,
): string[] {
  const now = Date.now();
  return [
    ...new Set(
      context.grants
        .filter(
          (grant) =>
            grant.organizationId === organizationId &&
            grant.capabilities.has(capability) &&
            (!grant.projectId || grant.projectId === projectId) &&
            (!grant.expiresAt || grant.expiresAt.getTime() > now),
        )
        .map((grant) => grant.vendorId),
    ),
  ];
}

/**
 * Portal routes carry only the project id. Picks the organization among the principal's grants
 * whose contractor scope covers the project (`app.external_can_see_project`). NotFound otherwise.
 */
export async function resolveContractorProjectOrganization(
  context: ExternalContext,
  projectId: string,
): Promise<string> {
  const organizations = [...new Set(context.grants.map((grant) => grant.organizationId))];
  for (const organizationId of organizations) {
    const result = await context.db.execute(
      sql`select app.external_can_see_project(${organizationId}::uuid, ${projectId}::uuid) as visible`,
    );
    const rows = (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as {
      visible: boolean;
    }[];
    if (rows[0]?.visible) return organizationId;
  }
  throw new NotFoundError('project');
}

function requireVendors(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  capability: ExternalCapability,
): string[] {
  const vendorIds = externalVendorsFor(context, organizationId, projectId, capability);
  if (vendorIds.length === 0) throw new AuthorizationError(`external:${capability}`);
  return vendorIds;
}

async function loadScopedDefect(
  context: ExternalContext,
  organizationId: string,
  defectId: string,
): Promise<DefectRow> {
  const row = await findDefectRow(context.db, organizationId, defectId);
  if (!row || !row.vendorId || !row.contractorVisible || row.status === 'cancelled') {
    throw new NotFoundError('defect');
  }
  try {
    requireExternalScope(
      context,
      {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
      },
      X.DEFECT_WORK,
    );
  } catch {
    throw new NotFoundError('defect');
  }
  return row;
}

export async function listContractorDefects(
  context: ExternalContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly status?: DefectStatusFilter;
    readonly limit?: number;
    readonly offset?: number;
  },
): Promise<DefectListPage> {
  const vendorIds = requireVendors(context, input.organizationId, input.projectId, X.DEFECT_WORK);
  return listDefectRows(
    context.db,
    { organizationId: input.organizationId, projectId: input.projectId, vendorIds },
    { status: input.status ?? 'all', limit: input.limit, offset: input.offset },
    'external',
    utcToday(),
  );
}

export async function getContractorDefect(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly defectId: string },
): Promise<DefectDetail & { readonly canSubmitCompletion: boolean }> {
  const row = await loadScopedDefect(context, input.organizationId, input.defectId);
  const detail = await loadDefectDetail(context.db, row, 'external', utcToday());
  return { ...detail, canSubmitCompletion: planDefectStep('submit_completion', row.status) !== null };
}

/**
 * Contractor submits the repair of the current cycle. Requires at least one contractor-visible
 * evidence item uploaded during this cycle (photo / video / document via the evidence module).
 */
export async function submitDefectCompletion(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly defectId: string } & DefectNoteInput,
): Promise<void> {
  const parsed = parseOrThrow(noteSchema, { note: input.note });
  const row = await loadScopedDefect(context, input.organizationId, input.defectId);
  const step = planDefectStep('submit_completion', row.status);
  if (!step) {
    throw new DomainRuleError('Completion cannot be submitted now', 'defects.errors.invalidTransition', {
      status: row.status,
    });
  }

  const records = await listCycleRecords(context.db, input.organizationId, row.id, 'external');
  const cycleStartedAt = currentCycleStartedAt(records, row.cycleNo, row.createdAt);
  const evidence = await listEvidence(context.db, {
    organizationId: input.organizationId,
    entityType: 'defect',
    entityId: row.id,
    audience: 'contractor',
  });
  if (countCycleEvidence(evidence, cycleStartedAt) === 0) {
    throw new DomainRuleError('Evidence is required', 'defects.errors.evidenceRequired');
  }

  const ok = await updateDefectRow(context.db, input.organizationId, row.id, row.status, {
    status: step.to,
    lastSubmittedAt: new Date(),
  });
  if (!ok) throw new ConflictError('Defect changed concurrently', 'defects.errors.concurrentChange');

  const actor = externalActor(context.principalId);
  await insertCycleRecord(context.db, {
    organizationId: input.organizationId,
    projectId: row.projectId,
    defectId: row.id,
    cycleNo: row.cycleNo,
    kind: step.record,
    fromStatus: row.status,
    toStatus: step.to,
    note: parsed.note,
    details: { evidenceCount: countCycleEvidence(evidence, cycleStartedAt) },
    actor,
  });
  await emitDomainEvent(context.db, {
    organizationId: input.organizationId,
    projectId: row.projectId,
    type: DOMAIN_EVENTS.DEFECT_ITEM_COMPLETION_SUBMITTED,
    entityType: 'defect',
    entityId: row.id,
    actor,
    payload: {
      defectId: row.id,
      referenceNo: row.referenceNo,
      severity: row.severity,
      mode: row.mode,
      vendorId: row.vendorId,
      subcontractAgreementId: row.subcontractAgreementId,
      cycleNo: row.cycleNo,
    },
  });
}

/**
 * Portal summary (Track R dashboard). Never throws for missing capabilities: a section the grant
 * does not cover simply counts zero.
 */
export async function getContractorQualitySummary(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<ContractorQualitySummary> {
  const today = utcToday();
  const defectVendors = externalVendorsFor(context, input.organizationId, input.projectId, X.DEFECT_WORK);
  const inspectionVendors = externalVendorsFor(context, input.organizationId, input.projectId, X.INSPECTION_VIEW);

  let defectsToFix = 0;
  let defectsOverdue = 0;
  let defectsReopened = 0;
  let defectsAwaitingVerification = 0;
  if (defectVendors.length > 0) {
    const counts = await countDefectsByStatus(
      context.db,
      { organizationId: input.organizationId, projectId: input.projectId, vendorIds: defectVendors },
      today,
    );
    defectsToFix = counts.assigned + counts.reopened + counts.open;
    defectsOverdue = counts.overdue;
    defectsReopened = counts.reopened;
    defectsAwaitingVerification = counts.awaitingVerification;
  }

  let inspectionsUpcoming = 0;
  let inspectionsFailedOpen = 0;
  if (inspectionVendors.length > 0) {
    const base: SQL[] = [
      eq(qualityInspections.organizationId, input.organizationId),
      eq(qualityInspections.projectId, input.projectId),
      inArray(qualityInspections.vendorId, inspectionVendors),
      isNull(qualityInspections.archivedAt),
    ];
    const [upcoming] = await context.db
      .select({ value: count() })
      .from(qualityInspections)
      .where(
        and(
          ...base,
          inArray(qualityInspections.status, ['scheduled', 'in_progress']),
          gte(qualityInspections.scheduledFor, today),
        ),
      );
    const [failed] = await context.db
      .select({ value: count() })
      .from(qualityInspections)
      .where(and(...base, eq(qualityInspections.status, 'completed'), eq(qualityInspections.outcome, 'fail')));
    inspectionsUpcoming = Number(upcoming?.value ?? 0);
    inspectionsFailedOpen = Number(failed?.value ?? 0);
  }

  return {
    defectsToFix,
    defectsOverdue,
    defectsReopened,
    defectsAwaitingVerification,
    inspectionsUpcoming,
    inspectionsFailedOpen,
  };
}
