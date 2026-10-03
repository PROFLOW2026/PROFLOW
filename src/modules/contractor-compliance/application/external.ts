import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { externalActor } from '@/shared/actor';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  requireExternalScope,
  type ExternalCapability,
  type ExternalContext,
} from '@/shared/external';
import { todayInTimeZone } from '@/shared/dates';
import { countStatuses } from '../domain/status';
import { assertRequirementOpen, assertSubmissionDates } from '../domain/review';
import { evaluateRequirements } from '../domain/views';
import {
  COMPLIANCE_DOCUMENT_ENTITY,
  type ComplianceStatus,
  type RequirementWithStatus,
} from '../domain/types';
import {
  findRequirement,
  insertDocument,
  listDocumentsForRequirements,
  listProjectAgreements,
  listRequirements,
} from '../data/compliance.repository';
import { submitDocumentSchema, type SubmitDocumentInput } from '../validation/schemas';
import { recordExternalAudit } from './external-audit';

/** True when some grant of the principal could cover `capability` on the project (list gate). */
export function externalProjectGate(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  capability: ExternalCapability,
): void {
  const now = Date.now();
  const allowed = context.grants.some(
    (grant) =>
      grant.organizationId === organizationId &&
      (grant.projectId === null || grant.projectId === projectId) &&
      grant.capabilities.has(capability) &&
      (!grant.expiresAt || grant.expiresAt.getTime() > now),
  );
  if (!allowed) throw new AuthorizationError(`external:${capability}`);
}

/** External principals cannot read the organization row; contractor dates use the product's home timezone. */
export const EXTERNAL_DEFAULT_TIMEZONE = 'Asia/Jerusalem';

function externalToday(): string {
  return todayInTimeZone(EXTERNAL_DEFAULT_TIMEZONE) as string;
}

export interface ContractorAgreementCompliance {
  readonly agreementId: string;
  readonly agreementTitle: string | null;
  readonly requirements: readonly RequirementWithStatus[];
}

export interface ContractorComplianceView {
  readonly today: string;
  readonly agreements: readonly ContractorAgreementCompliance[];
  readonly counts: Readonly<Record<ComplianceStatus, number>>;
  readonly pendingReviewCount: number;
  /** Requirements the contractor must act on (missing / expired / expiring / last rejected). */
  readonly actionRequiredCount: number;
}

async function agreementTitles(context: ExternalContext, organizationId: string, projectId: string) {
  const rows = await listProjectAgreements(context.db, organizationId, projectId);
  return new Map(rows.map((row) => [row.id, row.title]));
}

/** Contractor portal: own requirements + submissions on one project (RLS + grant filtered). */
export async function getContractorCompliance(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string; readonly today?: string },
): Promise<ContractorComplianceView> {
  externalProjectGate(context, input.organizationId, input.projectId, X.COMPLIANCE_SUBMIT);
  const today = input.today ?? externalToday();
  const requirements = (
    await listRequirements(context.db, input.organizationId, { projectId: input.projectId })
  ).filter((row) =>
    hasExternalScope(
      context,
      {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
      },
      X.COMPLIANCE_SUBMIT,
    ),
  );
  const documents = await listDocumentsForRequirements(
    context.db,
    input.organizationId,
    requirements.map((row) => row.id),
  );
  const evaluated = evaluateRequirements(requirements, documents, today);
  const agreementIds = [...new Set(evaluated.map((row) => row.subcontractAgreementId))];
  const titles =
    agreementIds.length > 0 ? await agreementTitles(context, input.organizationId, input.projectId) : new Map<string, string>();

  return {
    today,
    agreements: agreementIds.map((agreementId) => ({
      agreementId,
      agreementTitle: titles.get(agreementId) ?? null,
      requirements: evaluated.filter((row) => row.subcontractAgreementId === agreementId),
    })),
    counts: countStatuses(evaluated.map((row) => row.evaluation.status)),
    pendingReviewCount: evaluated.filter((row) => row.evaluation.pendingReview).length,
    actionRequiredCount: evaluated.filter(
      (row) =>
        !row.evaluation.pendingReview &&
        (row.evaluation.status !== 'current' || row.evaluation.lastRejected),
    ).length,
  };
}

/** Portal dashboard summary for Track R (counts only). */
export async function getContractorComplianceSummary(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<Pick<ContractorComplianceView, 'counts' | 'pendingReviewCount' | 'actionRequiredCount'>> {
  const view = await getContractorCompliance(context, input);
  return {
    counts: view.counts,
    pendingReviewCount: view.pendingReviewCount,
    actionRequiredCount: view.actionRequiredCount,
  };
}

/**
 * Contractor uploads a compliance document (metadata first; the file is attached through the
 * evidence uploader on entity `compliance_document`). Always lands as pending_review.
 */
export async function submitContractorComplianceDocument(
  context: ExternalContext,
  raw: SubmitDocumentInput & { readonly organizationId: string },
): Promise<{ readonly documentId: string }> {
  const parsed = submitDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const requirement = await findRequirement(context.db, raw.organizationId, input.requirementId);
  if (!requirement || requirement.projectId !== input.projectId) throw new NotFoundError('Compliance requirement');
  requireExternalScope(
    context,
    {
      organizationId: requirement.organizationId,
      projectId: requirement.projectId,
      vendorId: requirement.vendorId,
      subcontractAgreementId: requirement.subcontractAgreementId,
    },
    X.COMPLIANCE_SUBMIT,
  );
  assertRequirementOpen(requirement);
  assertSubmissionDates({
    requiresExpiry: requirement.requiresExpiry,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
  });

  const id = randomUUID();
  await insertDocument(context.db, {
    id,
    organizationId: requirement.organizationId,
    projectId: requirement.projectId,
    vendorId: requirement.vendorId,
    subcontractAgreementId: requirement.subcontractAgreementId,
    requirementId: requirement.id,
    referenceNumber: input.referenceNumber,
    issuer: input.issuer,
    issuedOn: input.issuedOn,
    expiresOn: input.expiresOn,
    notes: input.notes,
    documentId: null,
    complianceArtifactId: null,
    submittedActorType: 'external',
    submittedByUserId: null,
    submittedByPrincipalId: context.principalId,
  });
  await emitDomainEvent(context.db, {
    organizationId: requirement.organizationId,
    projectId: requirement.projectId,
    type: DOMAIN_EVENTS.COMPLIANCE_DOCUMENT_SUBMITTED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: id,
    actor: externalActor(context.principalId),
    payload: {
      requirementId: requirement.id,
      kind: requirement.kind,
      agreementId: requirement.subcontractAgreementId,
      vendorId: requirement.vendorId,
      expiresOn: input.expiresOn,
    },
  });
  await recordExternalAudit(context.db, {
    organizationId: requirement.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_DOCUMENT_SUBMITTED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: id,
    after: { requirementId: requirement.id, expiresOn: input.expiresOn },
  });
  return { documentId: id };
}
