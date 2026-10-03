import { AUDIT_ACTIONS } from '@/shared/audit';
import { externalActor } from '@/shared/actor';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { externalProjectGate, recordExternalAudit } from '@/modules/contractor-compliance';
import { insertSafetyRecord, listCorrectiveActionsForRecord } from '../data/safety.repository';
import type { SafetyCorrectiveActionRecord } from '../domain/types';
import {
  SAFETY_RECORD_ENTITY,
  resolveReportingVendor,
  type ContractorSafetyRecord,
} from './domain';
import { findContractorSafetyRecord, insertContractorLink, listContractorSafetyRecords } from './repository';
import { externalSafetyReportSchema, type ExternalSafetyReportInput } from './schemas';

function coveredBy(context: ExternalContext, record: ContractorSafetyRecord): boolean {
  return hasExternalScope(
    context,
    {
      organizationId: record.organizationId,
      projectId: record.projectId,
      vendorId: record.vendorId,
      subcontractAgreementId: record.subcontractAgreementId,
    },
    X.SAFETY_REPORT,
  );
}

/** Contractor portal list: own visible safety records on one project. */
export async function listContractorSafetyForPortal(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<readonly ContractorSafetyRecord[]> {
  externalProjectGate(context, input.organizationId, input.projectId, X.SAFETY_REPORT);
  const rows = await listContractorSafetyRecords(context.db, input.organizationId, { projectId: input.projectId });
  return rows.filter((row) => row.contractorVisible && coveredBy(context, row));
}

export async function getContractorSafetyForPortal(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string; readonly safetyRecordId: string },
): Promise<ContractorSafetyRecord & { readonly actions: readonly SafetyCorrectiveActionRecord[] }> {
  const record = await findContractorSafetyRecord(context.db, input.organizationId, input.safetyRecordId);
  if (!record || record.projectId !== input.projectId || !record.contractorVisible || !coveredBy(context, record)) {
    throw new NotFoundError('Safety record');
  }
  const actions = await listCorrectiveActionsForRecord(context.db, input.organizationId, record.id);
  return { ...record, actions };
}

/** Vendor ids the principal may report safety for on a project. */
export function reportingVendorIds(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
): readonly string[] {
  return [
    ...new Set(
      context.grants
        .filter(
          (grant) =>
            grant.organizationId === organizationId &&
            (grant.projectId === null || grant.projectId === projectId) &&
            grant.capabilities.has(X.SAFETY_REPORT),
        )
        .map((grant) => grant.vendorId),
    ),
  ];
}

/**
 * Contractor reports an observation / hazard / incident (ext.safety.report). The base
 * `safety_records` row is written with service-role elevation AFTER the grant check (external
 * principals have no insert policy on the internal safety log); the contractor link is then
 * inserted under the contractor's own RLS (WITH CHECK app.external_has_scope), so a forged scope
 * aborts the whole transaction.
 */
export async function reportSafetyFromPortal(
  context: ExternalContext,
  raw: ExternalSafetyReportInput,
): Promise<{ readonly safetyRecordId: string }> {
  const parsed = externalSafetyReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const vendorId = resolveReportingVendor(
    reportingVendorIds(context, input.organizationId, input.projectId),
    input.vendorId,
  );
  if (!vendorId) throw new NotFoundError('Contractor');
  requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId,
      subcontractAgreementId: input.agreementId,
    },
    X.SAFETY_REPORT,
  );

  const base = await asServiceRoleWrite(context.db, () =>
    insertSafetyRecord(context.db, {
      organizationId: input.organizationId,
      projectId: input.projectId,
      recordType: input.recordType,
      occurredAt: input.occurredAt,
      reporterUserId: null,
      severity: input.severity,
      title: input.title,
      description: input.description,
      immediateAction: input.immediateAction,
      status: 'open',
    }),
  );
  await insertContractorLink(context.db, {
    safetyRecordId: base.id,
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorId,
    subcontractAgreementId: input.agreementId,
    locationId: input.locationId,
    contractorVisible: true,
    reportedActorType: 'external',
    reportedByUserId: null,
    reportedByPrincipalId: context.principalId,
  });
  await emitDomainEvent(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.SAFETY_RECORD_REPORTED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: base.id,
    actor: externalActor(context.principalId),
    payload: {
      recordType: input.recordType,
      severity: input.severity,
      vendorId,
      agreementId: input.agreementId,
      contractorVisible: true,
    },
  });
  await recordExternalAudit(context.db, {
    organizationId: input.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.CONTRACTOR_SAFETY_REPORTED,
    entityType: SAFETY_RECORD_ENTITY,
    entityId: base.id,
    after: { recordType: input.recordType, severity: input.severity, vendorId },
  });
  return { safetyRecordId: base.id };
}
