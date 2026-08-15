import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  activityEvents,
  approvalRequests,
  approvals,
  auditEvents,
  billingRecords,
  boqProgressBatches,
  changeRequests,
  contracts,
  documentLinks,
  documents,
  documentVersions,
  estimates,
  monthCloseAdjustments,
  payments,
  profiles,
  projectMilestones,
  projects,
  quotes,
  quoteVersions,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

const SOURCE_CAP = 200;

export interface ActivityEventInsert {
  readonly clientId?: string | null;
  readonly projectId?: string | null;
  readonly actorUserId?: string | null;
  readonly occurredAt?: Date;
  readonly kind: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly deepLink?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface ActivityEventRow {
  readonly id: string;
  readonly clientId: string | null;
  readonly projectId: string | null;
  readonly actorUserId: string | null;
  readonly occurredAt: Date;
  readonly kind: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly deepLink: string | null;
  readonly metadata: Record<string, unknown> | null;
}

function mapActivityEvent(row: typeof activityEvents.$inferSelect): ActivityEventRow {
  return {
    id: row.id,
    clientId: row.clientId,
    projectId: row.projectId,
    actorUserId: row.actorUserId,
    occurredAt: row.occurredAt,
    kind: row.kind,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    deepLink: row.deepLink,
    metadata: row.metadata,
  };
}

export async function upsertActivityEvent(
  db: DbExecutor,
  organizationId: string,
  input: ActivityEventInsert,
): Promise<ActivityEventRow> {
  const occurredAt = input.occurredAt ?? new Date();
  const [row] = await db
    .insert(activityEvents)
    .values({
      organizationId,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      actorUserId: input.actorUserId ?? null,
      occurredAt,
      kind: input.kind,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      deepLink: input.deepLink ?? null,
      metadata: input.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: [
        activityEvents.organizationId,
        activityEvents.kind,
        activityEvents.entityType,
        activityEvents.entityId,
      ],
      set: {
        summary: input.summary,
        deepLink: input.deepLink ?? null,
        metadata: input.metadata ?? null,
        clientId: input.clientId ?? null,
        projectId: input.projectId ?? null,
        actorUserId: input.actorUserId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapActivityEvent(row!);
}

export async function listActivityEventsForClient(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<ActivityEventRow[]> {
  const rows = await db
    .select()
    .from(activityEvents)
    .where(
      and(eq(activityEvents.organizationId, organizationId), eq(activityEvents.clientId, clientId)),
    )
    .orderBy(desc(activityEvents.occurredAt))
    .limit(SOURCE_CAP);

  return rows.map(mapActivityEvent);
}

export async function listProjectsForClientTimeline(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      workKind: projects.workKind,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.clientId, clientId)))
    .orderBy(desc(projects.createdAt))
    .limit(SOURCE_CAP);
}

export async function listEstimatesForClientTimeline(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
) {
  return db
    .select({
      id: estimates.id,
      title: estimates.title,
      status: estimates.status,
      createdAt: estimates.createdAt,
      sentAt: estimates.sentAt,
      decidedAt: estimates.decidedAt,
      createdByUserId: estimates.createdByUserId,
    })
    .from(estimates)
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        eq(estimates.clientId, clientId),
        isNull(estimates.archivedAt),
      ),
    )
    .orderBy(desc(estimates.createdAt))
    .limit(SOURCE_CAP);
}

export async function listContractsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: contracts.id,
      projectId: contracts.projectId,
      name: contracts.name,
      reference: contracts.reference,
      createdAt: contracts.createdAt,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        inArray(contracts.projectId, [...projectIds]),
        isNull(contracts.archivedAt),
      ),
    )
    .orderBy(desc(contracts.createdAt))
    .limit(SOURCE_CAP);
}

export async function listChangeRequestsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: changeRequests.id,
      projectId: changeRequests.projectId,
      title: changeRequests.title,
      status: changeRequests.status,
      createdAt: changeRequests.createdAt,
      decidedAt: changeRequests.decidedAt,
      createdByUserId: changeRequests.createdByUserId,
    })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.organizationId, organizationId),
        inArray(changeRequests.projectId, [...projectIds]),
        isNull(changeRequests.archivedAt),
      ),
    )
    .orderBy(desc(changeRequests.createdAt))
    .limit(SOURCE_CAP);
}

export async function listQuoteVersionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: quoteVersions.id,
      quoteId: quotes.id,
      projectId: quotes.projectId,
      changeRequestId: quotes.changeRequestId,
      title: quotes.title,
      status: quoteVersions.status,
      versionNumber: quoteVersions.versionNumber,
      createdAt: quoteVersions.createdAt,
      issuedAt: quoteVersions.issuedAt,
    })
    .from(quoteVersions)
    .innerJoin(quotes, eq(quotes.id, quoteVersions.quoteId))
    .where(
      and(
        eq(quoteVersions.organizationId, organizationId),
        inArray(quotes.projectId, [...projectIds]),
        isNull(quotes.archivedAt),
      ),
    )
    .orderBy(desc(quoteVersions.createdAt))
    .limit(SOURCE_CAP);
}

export async function listMilestonesForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: projectMilestones.id,
      projectId: projectMilestones.projectId,
      name: projectMilestones.name,
      status: projectMilestones.status,
      createdAt: projectMilestones.createdAt,
      completedAt: projectMilestones.completedAt,
    })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        inArray(projectMilestones.projectId, [...projectIds]),
        isNull(projectMilestones.archivedAt),
      ),
    )
    .orderBy(desc(projectMilestones.createdAt))
    .limit(SOURCE_CAP);
}

export async function listBoqProgressForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: boqProgressBatches.id,
      projectId: boqProgressBatches.projectId,
      periodLabel: boqProgressBatches.periodLabel,
      certificateNumber: boqProgressBatches.certificateNumber,
      status: boqProgressBatches.status,
      approvedAt: boqProgressBatches.approvedAt,
      createdAt: boqProgressBatches.createdAt,
      approvedByUserId: boqProgressBatches.approvedByUserId,
    })
    .from(boqProgressBatches)
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        inArray(boqProgressBatches.projectId, [...projectIds]),
        isNull(boqProgressBatches.archivedAt),
        ne(boqProgressBatches.status, 'voided'),
      ),
    )
    .orderBy(desc(boqProgressBatches.createdAt))
    .limit(SOURCE_CAP);
}

export async function listBillingForClientTimeline(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
) {
  return db
    .select({
      id: billingRecords.id,
      projectId: billingRecords.projectId,
      projectName: projects.name,
      reference: billingRecords.reference,
      kind: billingRecords.kind,
      status: billingRecords.status,
      createdAt: billingRecords.createdAt,
      finalizedAt: billingRecords.finalizedAt,
      voidedAt: billingRecords.voidedAt,
      createdByUserId: billingRecords.createdByUserId,
    })
    .from(billingRecords)
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        or(eq(billingRecords.clientId, clientId), eq(projects.clientId, clientId)),
      ),
    )
    .orderBy(desc(billingRecords.createdAt))
    .limit(SOURCE_CAP);
}

export async function listPaymentsForClientTimeline(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
) {
  return db
    .select({
      id: payments.id,
      billingRecordId: payments.billingRecordId,
      projectId: billingRecords.projectId,
      projectName: projects.name,
      status: payments.status,
      paymentDate: payments.paymentDate,
      createdAt: payments.createdAt,
      createdByUserId: payments.createdByUserId,
      reference: payments.reference,
    })
    .from(payments)
    .leftJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
    .leftJoin(projects, eq(projects.id, billingRecords.projectId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        or(
          eq(payments.clientId, clientId),
          eq(billingRecords.clientId, clientId),
          eq(projects.clientId, clientId),
        ),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(SOURCE_CAP);
}

export async function listDocumentsForClientTimeline(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
  projectIds: readonly string[],
) {
  const ownerFilter =
    projectIds.length > 0
      ? or(
          and(eq(documentLinks.ownerType, 'client'), eq(documentLinks.ownerId, clientId)),
          and(eq(documentLinks.ownerType, 'project'), inArray(documentLinks.ownerId, [...projectIds])),
        )
      : and(eq(documentLinks.ownerType, 'client'), eq(documentLinks.ownerId, clientId));

  return db
    .select({
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      status: documents.status,
      createdAt: documents.createdAt,
      uploadedByUserId: documents.uploadedByUserId,
      ownerType: documentLinks.ownerType,
      ownerId: documentLinks.ownerId,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt),
        ne(documents.status, 'deleted'),
        ownerFilter,
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(SOURCE_CAP);
}

export async function listDocumentVersionsForDocuments(
  db: DbExecutor,
  organizationId: string,
  documentIds: readonly string[],
) {
  if (documentIds.length === 0) return [];
  return db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      versionNumber: documentVersions.versionNumber,
      originalFilename: documentVersions.originalFilename,
      uploadedAt: documentVersions.uploadedAt,
      uploadedByUserId: documentVersions.uploadedByUserId,
    })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.organizationId, organizationId),
        inArray(documentVersions.documentId, [...documentIds]),
        sql`${documentVersions.versionNumber} >= 2`,
      ),
    )
    .orderBy(desc(documentVersions.uploadedAt))
    .limit(SOURCE_CAP);
}

export async function listClientAuditEvents(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
) {
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorUserId: auditEvents.actorUserId,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.entityType, 'client'),
        eq(auditEvents.entityId, clientId),
        inArray(auditEvents.action, ['client.created', 'client.updated']),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(40);
}

export async function listCommercialApprovalsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: approvals.id,
      targetType: approvals.targetType,
      targetId: approvals.targetId,
      decision: approvals.decision,
      approverName: approvals.approverName,
      recordedByUserId: approvals.recordedByUserId,
      decidedAt: approvals.decidedAt,
      projectId: changeRequests.projectId,
    })
    .from(approvals)
    .leftJoin(
      changeRequests,
      and(eq(approvals.targetType, 'change_request'), eq(changeRequests.id, approvals.targetId)),
    )
    .where(
      and(
        eq(approvals.organizationId, organizationId),
        inArray(changeRequests.projectId, [...projectIds]),
      ),
    )
    .orderBy(desc(approvals.decidedAt))
    .limit(SOURCE_CAP);
}

export async function listQuoteDiscountApprovals(
  db: DbExecutor,
  organizationId: string,
  estimateIds: readonly string[],
) {
  if (estimateIds.length === 0) return [];
  return db
    .select({
      id: approvalRequests.id,
      entityId: approvalRequests.entityId,
      status: approvalRequests.status,
      submittedByUserId: approvalRequests.submittedByUserId,
      decidedByUserId: approvalRequests.decidedByUserId,
      decidedAt: approvalRequests.decidedAt,
      createdAt: approvalRequests.createdAt,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.entityType, 'quote_discount'),
        inArray(approvalRequests.entityId, [...estimateIds]),
        inArray(approvalRequests.status, ['approved', 'rejected']),
      ),
    )
    .orderBy(desc(approvalRequests.createdAt))
    .limit(SOURCE_CAP);
}

export async function listEconomicCorrectionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
) {
  if (projectIds.length === 0) return [];
  return db
    .select({
      id: monthCloseAdjustments.id,
      projectId: monthCloseAdjustments.projectId,
      reason: monthCloseAdjustments.reason,
      amount: monthCloseAdjustments.amount,
      currency: monthCloseAdjustments.currency,
      effectSide: monthCloseAdjustments.effectSide,
      createdByUserId: monthCloseAdjustments.createdByUserId,
      createdAt: monthCloseAdjustments.createdAt,
      supersedesAdjustmentId: monthCloseAdjustments.supersedesAdjustmentId,
    })
    .from(monthCloseAdjustments)
    .where(
      and(
        eq(monthCloseAdjustments.organizationId, organizationId),
        inArray(monthCloseAdjustments.projectId, [...projectIds]),
        sql`${monthCloseAdjustments.amount} is not null`,
      ),
    )
    .orderBy(desc(monthCloseAdjustments.createdAt))
    .limit(SOURCE_CAP);
}

export async function listProfileDisplayNames(
  db: DbExecutor,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const rows = await db
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(profiles)
    .where(inArray(profiles.id, unique));

  const names = new Map<string, string>();
  for (const row of rows) {
    names.set(row.id, row.displayName?.trim() || row.email);
  }
  return names;
}
