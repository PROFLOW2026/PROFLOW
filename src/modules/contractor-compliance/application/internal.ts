import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { internalActor } from '@/shared/actor';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { countEvidence } from '@/modules/evidence';
import { PROJECT_CAPABILITIES as C, assertProjectCapability, hasProjectCapability } from '@/modules/project-team';
import { assertRequirementOpen, assertReviewDecision, assertSubmissionDates } from '../domain/review';
import { missingStandardKinds } from '../domain/standard-set';
import { buildAgreementViews, evaluateRequirements } from '../domain/views';
import {
  COMPLIANCE_DOCUMENT_ENTITY,
  type AgreementComplianceView,
  type ComplianceDocumentRecord,
  type ComplianceRequirementKind,
  type ComplianceRequirementRecord,
} from '../domain/types';
import {
  findAgreementScope,
  findDocument,
  findRequirement,
  findVendorArtifact,
  insertDocument,
  insertRequirements,
  listDocumentsForRequirements,
  listProjectAgreements,
  listRequirements,
  listVendorArtifacts,
  nextRequirementSortOrder,
  reviewDocumentRow,
  updateRequirementRow,
  type AgreementScopeRow,
  type InsertRequirementRow,
  type VendorArtifactRow,
} from '../data/compliance.repository';
import {
  applyStandardSetSchema,
  createRequirementSchema,
  internalSubmitDocumentSchema,
  reviewDocumentSchema,
  updateRequirementSchema,
  type ApplyStandardSetInput,
  type CreateRequirementInput,
  type InternalSubmitDocumentInput,
  type ReviewDocumentInput,
  type UpdateRequirementInput,
} from '../validation/schemas';

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } }): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export function organizationToday(context: OrgContext): string {
  return todayInTimeZone(context.organization.timezone) as string;
}

/** Entity of project A is never reachable through a capability on project B. */
function requireOnProject<T extends { projectId: string }>(row: T | null, projectId: string, resource: string): T {
  if (!row || row.projectId !== projectId) throw new NotFoundError(resource);
  return row;
}

async function requireAgreementOnProject(
  context: OrgContext,
  projectId: string,
  agreementId: string,
): Promise<AgreementScopeRow> {
  const agreement = await findAgreementScope(context.db, context.organizationId, agreementId);
  return requireOnProject(agreement, projectId, 'Subcontract agreement');
}

// ── Read ─────────────────────────────────────────────────────────────────────────────────────

export interface ProjectComplianceOverview {
  readonly today: string;
  readonly canManage: boolean;
  readonly agreements: readonly AgreementComplianceView[];
  readonly pendingReviews: readonly (ComplianceDocumentRecord & {
    readonly requirementTitle: string;
    readonly requirementKind: ComplianceRequirementKind;
    readonly vendorName: string;
  })[];
}

export async function getProjectComplianceOverview(
  context: OrgContext,
  projectId: string,
): Promise<ProjectComplianceOverview> {
  await assertProjectCapability(context, projectId, C.CONTRACTOR_VIEW);
  const today = organizationToday(context);
  const [agreements, requirements, canManage] = await Promise.all([
    listProjectAgreements(context.db, context.organizationId, projectId),
    listRequirements(context.db, context.organizationId, { projectId }),
    hasProjectCapability(context, projectId, C.CONTRACTOR_COORDINATE),
  ]);
  const documents = await listDocumentsForRequirements(
    context.db,
    context.organizationId,
    requirements.map((row) => row.id),
  );
  const evaluated = evaluateRequirements(requirements, documents, today);
  const views = buildAgreementViews(
    agreements.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
    })),
    evaluated,
  );

  const requirementById = new Map(requirements.map((row) => [row.id, row]));
  const vendorName = new Map(agreements.map((row) => [row.vendorId, row.vendorName]));
  const pendingReviews = documents
    .filter((document) => document.reviewStatus === 'pending_review')
    .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime())
    .map((document) => {
      const requirement = requirementById.get(document.requirementId)!;
      return {
        ...document,
        requirementTitle: requirement.title,
        requirementKind: requirement.kind,
        vendorName: vendorName.get(document.vendorId) ?? '',
      };
    });

  return { today, canManage, agreements: views, pendingReviews };
}

/** Vendor-level artifacts from the existing compliance module that can satisfy a requirement. */
export async function listReusableArtifacts(
  context: OrgContext,
  input: { readonly projectId: string; readonly agreementId: string },
): Promise<readonly VendorArtifactRow[]> {
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const agreement = await requireAgreementOnProject(context, input.projectId, input.agreementId);
  return listVendorArtifacts(context.db, context.organizationId, agreement.vendorId);
}

// ── Requirements ─────────────────────────────────────────────────────────────────────────────

export async function createComplianceRequirement(
  context: OrgContext,
  raw: CreateRequirementInput,
): Promise<ComplianceRequirementRecord> {
  const input = parse(createRequirementSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const agreement = await requireAgreementOnProject(context, input.projectId, input.agreementId);
  const sortOrder = await nextRequirementSortOrder(context.db, context.organizationId, agreement.id);
  const [created] = await insertRequirements(context.db, [
    {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      subcontractAgreementId: agreement.id,
      kind: input.kind,
      title: input.title,
      description: input.description,
      isRequired: input.isRequired,
      blocksPayment: input.blocksPayment,
      requiresExpiry: input.requiresExpiry,
      warningDays: input.warningDays,
      sortOrder,
      createdByUserId: context.userId,
    },
  ]);
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_REQUIREMENT_CREATED,
    entityType: 'compliance_requirement',
    entityId: created!.id,
    after: { kind: created!.kind, agreementId: agreement.id, isRequired: created!.isRequired },
  });
  return created!;
}

export async function applyStandardRequirementSet(
  context: OrgContext,
  raw: ApplyStandardSetInput,
): Promise<{ readonly created: number }> {
  const input = parse(applyStandardSetSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const projectAgreements = await listProjectAgreements(context.db, context.organizationId, input.projectId);
  const targets = input.agreementIds
    ? projectAgreements.filter((row) => input.agreementIds!.includes(row.id))
    : projectAgreements;
  if (input.agreementIds && targets.length !== new Set(input.agreementIds).size) {
    throw new NotFoundError('Subcontract agreement');
  }
  const existing = await listRequirements(context.db, context.organizationId, { projectId: input.projectId });

  const rows: InsertRequirementRow[] = [];
  for (const agreement of targets) {
    const present = existing.filter((row) => row.subcontractAgreementId === agreement.id);
    const startOrder = present.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
    missingStandardKinds(present.map((row) => row.kind)).forEach((template, index) => {
      rows.push({
        organizationId: context.organizationId,
        projectId: agreement.projectId,
        vendorId: agreement.vendorId,
        subcontractAgreementId: agreement.id,
        kind: template.kind,
        title: input.titles[template.kind] ?? template.kind,
        description: null,
        isRequired: template.isRequired,
        blocksPayment: template.blocksPayment,
        requiresExpiry: template.requiresExpiry,
        warningDays: template.warningDays,
        sortOrder: startOrder + index,
        createdByUserId: context.userId,
      });
    });
  }
  const created = await insertRequirements(context.db, rows);
  for (const requirement of created) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_REQUIREMENT_CREATED,
      entityType: 'compliance_requirement',
      entityId: requirement.id,
      after: { kind: requirement.kind, agreementId: requirement.subcontractAgreementId, standardSet: true },
    });
  }
  return { created: created.length };
}

export async function updateComplianceRequirement(
  context: OrgContext,
  raw: UpdateRequirementInput,
): Promise<ComplianceRequirementRecord> {
  const input = parse(updateRequirementSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const before = requireOnProject(
    await findRequirement(context.db, context.organizationId, input.requirementId),
    input.projectId,
    'Compliance requirement',
  );
  assertRequirementOpen(before);
  const isRequired = input.isRequired ?? before.isRequired;
  const blocksPayment = isRequired && (input.blocksPayment ?? before.blocksPayment);
  const updated = await updateRequirementRow(context.db, context.organizationId, before.id, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(raw.description !== undefined ? { description: input.description } : {}),
    isRequired,
    blocksPayment,
    ...(input.requiresExpiry !== undefined ? { requiresExpiry: input.requiresExpiry } : {}),
    ...(input.warningDays !== undefined ? { warningDays: input.warningDays } : {}),
  });
  if (!updated) throw new NotFoundError('Compliance requirement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_REQUIREMENT_UPDATED,
    entityType: 'compliance_requirement',
    entityId: updated.id,
    before: { isRequired: before.isRequired, blocksPayment: before.blocksPayment, warningDays: before.warningDays },
    after: { isRequired: updated.isRequired, blocksPayment: updated.blocksPayment, warningDays: updated.warningDays },
  });
  return updated;
}

export async function archiveComplianceRequirement(
  context: OrgContext,
  input: { readonly projectId: string; readonly requirementId: string },
): Promise<void> {
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const before = requireOnProject(
    await findRequirement(context.db, context.organizationId, input.requirementId),
    input.projectId,
    'Compliance requirement',
  );
  if (before.archivedAt) return;
  await updateRequirementRow(context.db, context.organizationId, before.id, { archivedAt: new Date() });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_REQUIREMENT_ARCHIVED,
    entityType: 'compliance_requirement',
    entityId: before.id,
    before: { kind: before.kind, title: before.title },
  });
}

// ── Submissions + review ─────────────────────────────────────────────────────────────────────

async function evidenceCountFor(context: OrgContext, document: ComplianceDocumentRecord): Promise<number> {
  const linked = (document.documentId ? 1 : 0) + (document.complianceArtifactId ? 1 : 0);
  if (linked > 0) return linked;
  return countEvidence(context.db, {
    organizationId: context.organizationId,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: document.id,
  });
}

/**
 * Internal submission on the contractor's behalf, or reuse of an existing vendor compliance
 * artifact. `approve` records the review in the same step (needs a document or artifact).
 */
export async function submitInternalComplianceDocument(
  context: OrgContext,
  raw: InternalSubmitDocumentInput,
): Promise<ComplianceDocumentRecord> {
  const input = parse(internalSubmitDocumentSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const requirement = requireOnProject(
    await findRequirement(context.db, context.organizationId, input.requirementId),
    input.projectId,
    'Compliance requirement',
  );
  assertRequirementOpen(requirement);

  let artifact: VendorArtifactRow | null = null;
  if (input.complianceArtifactId) {
    artifact = await findVendorArtifact(
      context.db,
      context.organizationId,
      requirement.vendorId,
      input.complianceArtifactId,
    );
    if (!artifact) throw new NotFoundError('Compliance artifact');
  }
  const issuedOn = input.issuedOn ?? artifact?.issuedOn ?? null;
  const expiresOn = input.expiresOn ?? artifact?.expiresOn ?? null;
  assertSubmissionDates({ requiresExpiry: requirement.requiresExpiry, issuedOn, expiresOn });
  if (input.approve) {
    assertReviewDecision({
      currentStatus: 'pending_review',
      decision: 'approved',
      note: input.notes,
      evidenceCount: (input.documentId ?? artifact?.documentId) || artifact ? 1 : 0,
    });
  }

  const id = randomUUID();
  await insertDocument(context.db, {
    id,
    organizationId: context.organizationId,
    projectId: requirement.projectId,
    vendorId: requirement.vendorId,
    subcontractAgreementId: requirement.subcontractAgreementId,
    requirementId: requirement.id,
    referenceNumber: input.referenceNumber ?? artifact?.referenceNumber ?? null,
    issuer: input.issuer ?? artifact?.issuer ?? null,
    issuedOn,
    expiresOn,
    notes: input.notes,
    documentId: input.documentId ?? artifact?.documentId ?? null,
    complianceArtifactId: artifact?.id ?? null,
    submittedActorType: 'internal',
    submittedByUserId: context.userId,
    submittedByPrincipalId: null,
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: requirement.projectId,
    type: DOMAIN_EVENTS.COMPLIANCE_DOCUMENT_SUBMITTED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: id,
    actor: internalActor(context.userId),
    payload: {
      requirementId: requirement.id,
      kind: requirement.kind,
      agreementId: requirement.subcontractAgreementId,
      vendorId: requirement.vendorId,
      expiresOn,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_DOCUMENT_SUBMITTED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: id,
    after: { requirementId: requirement.id, expiresOn, reusedArtifact: Boolean(artifact) },
  });

  if (input.approve) {
    return reviewComplianceDocument(context, {
      projectId: input.projectId,
      documentId: id,
      decision: 'approved',
      note: input.notes,
    });
  }
  const created = await findDocument(context.db, context.organizationId, id);
  return created!;
}

export async function reviewComplianceDocument(
  context: OrgContext,
  raw: ReviewDocumentInput,
): Promise<ComplianceDocumentRecord> {
  const input = parse(reviewDocumentSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const document = requireOnProject(
    await findDocument(context.db, context.organizationId, input.documentId),
    input.projectId,
    'Compliance document',
  );
  assertReviewDecision({
    currentStatus: document.reviewStatus,
    decision: input.decision,
    note: input.note,
    evidenceCount: input.decision === 'approved' ? await evidenceCountFor(context, document) : 0,
  });
  const reviewed = await reviewDocumentRow(context.db, context.organizationId, document.id, {
    reviewStatus: input.decision,
    reviewedByUserId: context.userId,
    reviewNote: input.note,
  });
  if (!reviewed) throw new NotFoundError('Compliance document');

  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: reviewed.projectId,
    type: DOMAIN_EVENTS.COMPLIANCE_DOCUMENT_REVIEWED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: reviewed.id,
    actor: internalActor(context.userId),
    payload: {
      requirementId: reviewed.requirementId,
      agreementId: reviewed.subcontractAgreementId,
      vendorId: reviewed.vendorId,
      reviewStatus: reviewed.reviewStatus,
    },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACTOR_COMPLIANCE_DOCUMENT_REVIEWED,
    entityType: COMPLIANCE_DOCUMENT_ENTITY,
    entityId: reviewed.id,
    before: { reviewStatus: document.reviewStatus },
    after: { reviewStatus: reviewed.reviewStatus },
  });
  return reviewed;
}
