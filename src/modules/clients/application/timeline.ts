import { isEconomicAdjustment, supersededAdjustmentIds } from '@/modules/month-close';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  capTimelineEvents,
  categoryForKind,
  isKnownTimelineKind,
  mapBillingStatusToTimeline,
  mergeCanonicalAndIndexEvents,
  sortTimelineEvents,
  workEntityHref,
  type TimelineEvent,
  type TimelineEventKind,
  type TimelinePresentation,
  type ClientTimelineEventView,
  type TimelineSortDirection,
} from '../domain/timeline';
import { getClientById } from './list-clients';
import {
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import {
  listActivityEventsForClient,
  listBillingForClientTimeline,
  listBoqProgressForProjects,
  listChangeRequestsForProjects,
  listClientAuditEvents,
  listCommercialApprovalsForProjects,
  listContractsForProjects,
  listDocumentVersionsForDocuments,
  listDocumentsForClientTimeline,
  listEconomicCorrectionsForProjects,
  listEstimatesForClientTimeline,
  listMilestonesForProjects,
  listPaymentsForClientTimeline,
  listProfileDisplayNames,
  listProjectsForClientTimeline,
  listQuoteDiscountApprovals,
  listQuoteVersionsForProjects,
  upsertActivityEvent,
  type ActivityEventInsert,
  type ActivityEventRow,
} from '../data/timeline.repository';
import {
  recordActivityEventSchema,
  type RecordActivityEventInput,
} from '../validation/schemas';

const TWO_SECONDS_MS = 2_000;

export interface ClientTimelineView {
  readonly clientId: string;
  readonly events: readonly ClientTimelineEventView[];
}

function eventId(kind: string, entityType: string, entityId: string, suffix = ''): string {
  return suffix ? `${kind}:${entityType}:${entityId}:${suffix}` : `${kind}:${entityType}:${entityId}`;
}

function atNoonUtc(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

function buildEvent(input: {
  kind: TimelineEventKind;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  summary: string;
  deepLink: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  status?: string | null;
  presentation?: TimelinePresentation;
  projectId?: string | null;
  projectName?: string | null;
  billingKind?: string | null;
  source?: 'canonical' | 'index';
  suffix?: string;
}): TimelineEvent {
  return {
    id: eventId(input.kind, input.entityType, input.entityId, input.suffix),
    occurredAt: input.occurredAt,
    category: categoryForKind(input.kind),
    kind: input.kind,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    deepLink: input.deepLink,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? null,
    status: input.status ?? null,
    presentation: input.presentation ?? 'neutral',
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    billingKind: input.billingKind ?? null,
    source: input.source ?? 'canonical',
  };
}

function actorName(names: Map<string, string>, userId: string | null | undefined): string | null {
  if (!userId) return null;
  return names.get(userId) ?? null;
}

function indexKind(kind: string): TimelineEventKind {
  return isKnownTimelineKind(kind) ? kind : 'indexed';
}

function eventsFromActivityIndex(
  rows: readonly ActivityEventRow[],
  names: Map<string, string>,
  projectNames: Map<string, string>,
): TimelineEvent[] {
  return rows.map((row) => {
    const kind = indexKind(row.kind);
    return buildEvent({
      kind,
      entityType: row.entityType,
      entityId: row.entityId,
      occurredAt: row.occurredAt,
      summary: row.summary,
      deepLink: row.deepLink,
      actorUserId: row.actorUserId,
      actorName: actorName(names, row.actorUserId),
      projectId: row.projectId,
      projectName: row.projectId ? (projectNames.get(row.projectId) ?? null) : null,
      source: 'index',
    });
  });
}

function serialize(event: TimelineEvent): ClientTimelineEventView {
  return {
    id: event.id,
    occurredAt: event.occurredAt.toISOString(),
    category: event.category,
    kind: event.kind,
    entityType: event.entityType,
    entityId: event.entityId,
    summary: event.summary,
    deepLink: event.deepLink,
    actorName: event.actorName,
    status: event.status,
    presentation: event.presentation,
    projectName: event.projectName,
    source: event.source,
  };
}

async function safeSource<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch {
    return fallback;
  }
}

/**
 * Idempotent pointer into `activity_events`. Unique on (org, kind, entity_type, entity_id).
 * Not financial truth — callers must still keep canonical tables correct.
 */
export async function recordActivityEvent(
  context: OrgContext,
  rawInput: RecordActivityEventInput,
): Promise<ActivityEventRow> {
  const parsed = recordActivityEventSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input: ActivityEventInsert = {
    clientId: parsed.data.clientId ?? null,
    projectId: parsed.data.projectId ?? null,
    actorUserId: parsed.data.actorUserId ?? context.userId,
    occurredAt: parsed.data.occurredAt,
    kind: parsed.data.kind,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    summary: parsed.data.summary,
    deepLink: parsed.data.deepLink ?? null,
    metadata: parsed.data.metadata ?? null,
  };

  return upsertActivityEvent(context.db, context.organizationId, input);
}

/**
 * Client card timeline. Aggregates canonical entities; `activity_events` fills gaps.
 */
export async function getClientTimeline(
  context: OrgContext,
  clientId: string,
  options: { readonly sort?: TimelineSortDirection } = {},
): Promise<ClientTimelineView> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  const client = await getClientById(context, clientId);
  const orgId = context.organizationId;
  const db = context.db;

  const canProjects = hasPermission(context, PERMISSIONS.PROJECTS_READ);
  const canQuotes = hasPermission(context, PERMISSIONS.QUOTES_READ);
  const canChanges = hasPermission(context, PERMISSIONS.CHANGES_READ);
  const canBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canDocuments = hasPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const canBoq = hasPermission(context, PERMISSIONS.BOQ_READ);
  const canApprovals = hasPermission(context, PERMISSIONS.APPROVALS_READ);
  const canMonthClose = hasPermission(context, PERMISSIONS.MONTH_CLOSE_READ);

  const allowedProjectIds = await resolveAccessibleProjectIds(context);
  const [listedProjects, estimates, indexed, auditRows] = await Promise.all([
    canProjects
      ? safeSource(() => listProjectsForClientTimeline(db, orgId, clientId), [])
      : Promise.resolve([]),
    canQuotes
      ? safeSource(() => listEstimatesForClientTimeline(db, orgId, clientId), [])
      : Promise.resolve([]),
    safeSource(() => listActivityEventsForClient(db, orgId, clientId), []),
    safeSource(() => listClientAuditEvents(db, orgId, clientId), []),
  ]);
  const projects = listedProjects.filter((project) =>
    isAccessibleProjectId(allowedProjectIds, project.id),
  );

  const projectIds = projects.map((project) => project.id);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const estimateIds = estimates.map((estimate) => estimate.id);

  const [
    contracts,
    changeRequests,
    quoteVersions,
    milestones,
    boqProgress,
    billingRows,
    paymentRows,
    documentRows,
    commercialApprovals,
    quoteApprovals,
    corrections,
  ] = await Promise.all([
    canProjects
      ? safeSource(() => listContractsForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canChanges
      ? safeSource(() => listChangeRequestsForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canChanges
      ? safeSource(() => listQuoteVersionsForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canProjects
      ? safeSource(() => listMilestonesForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canBoq
      ? safeSource(() => listBoqProgressForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canBilling
      ? safeSource(() => listBillingForClientTimeline(db, orgId, clientId), [])
      : Promise.resolve([]),
    canBilling
      ? safeSource(() => listPaymentsForClientTimeline(db, orgId, clientId), [])
      : Promise.resolve([]),
    canDocuments
      ? safeSource(() => listDocumentsForClientTimeline(db, orgId, clientId, projectIds), [])
      : Promise.resolve([]),
    canChanges
      ? safeSource(() => listCommercialApprovalsForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
    canApprovals
      ? safeSource(() => listQuoteDiscountApprovals(db, orgId, estimateIds), [])
      : Promise.resolve([]),
    canMonthClose
      ? safeSource(() => listEconomicCorrectionsForProjects(db, orgId, projectIds), [])
      : Promise.resolve([]),
  ]);

  const documentIds = [...new Set(documentRows.map((row) => row.documentId))];
  const versions = canDocuments
    ? await safeSource(() => listDocumentVersionsForDocuments(db, orgId, documentIds), [])
    : [];

  const actorIds = [
    ...projects.map(() => context.userId),
    ...estimates.map((row) => row.createdByUserId),
    ...changeRequests.map((row) => row.createdByUserId),
    ...billingRows.map((row) => row.createdByUserId),
    ...paymentRows.map((row) => row.createdByUserId),
    ...documentRows.map((row) => row.uploadedByUserId),
    ...versions.map((row) => row.uploadedByUserId),
    ...boqProgress.map((row) => row.approvedByUserId),
    ...commercialApprovals.map((row) => row.recordedByUserId),
    ...quoteApprovals.map((row) => row.decidedByUserId ?? row.submittedByUserId),
    ...corrections.map((row) => row.createdByUserId),
    ...indexed.map((row) => row.actorUserId),
    ...auditRows.map((row) => row.actorUserId),
  ].filter((id): id is string => Boolean(id));

  const names = await safeSource(() => listProfileDisplayNames(db, actorIds), new Map());

  const canonical: TimelineEvent[] = [];

  canonical.push(
    buildEvent({
      kind: 'client_created',
      entityType: 'client',
      entityId: client.id,
      occurredAt: client.createdAt,
      summary: client.name,
      deepLink: `/clients/${client.id}`,
      presentation: 'neutral',
    }),
  );

  const updateAudits = auditRows.filter((row) => row.action === 'client.updated');
  if (updateAudits.length > 0) {
    for (const row of updateAudits) {
      canonical.push(
        buildEvent({
          kind: 'client_updated',
          entityType: 'client',
          entityId: client.id,
          occurredAt: row.createdAt,
          summary: client.name,
          deepLink: `/clients/${client.id}`,
          actorUserId: row.actorUserId,
          actorName: actorName(names, row.actorUserId),
          suffix: row.id,
        }),
      );
    }
  } else if (client.updatedAt.getTime() - client.createdAt.getTime() > TWO_SECONDS_MS) {
    canonical.push(
      buildEvent({
        kind: 'client_updated',
        entityType: 'client',
        entityId: client.id,
        occurredAt: client.updatedAt,
        summary: client.name,
        deepLink: `/clients/${client.id}`,
      }),
    );
  }

  for (const project of projects) {
    const isWorkOrder = project.workKind === 'work_order';
    canonical.push(
      buildEvent({
        kind: isWorkOrder ? 'work_order_created' : 'project_created',
        entityType: 'project',
        entityId: project.id,
        occurredAt: project.createdAt,
        summary: project.name,
        deepLink: workEntityHref(project.workKind, project.id),
        status: project.status,
        presentation: project.status === 'cancelled' ? 'cancelled' : 'neutral',
        projectId: project.id,
        projectName: project.name,
      }),
    );

    if (
      project.status !== 'draft' &&
      project.updatedAt.getTime() - project.createdAt.getTime() > TWO_SECONDS_MS
    ) {
      canonical.push(
        buildEvent({
          kind: isWorkOrder ? 'work_order_status_changed' : 'project_status_changed',
          entityType: 'project',
          entityId: project.id,
          occurredAt: project.updatedAt,
          summary: project.name,
          deepLink: workEntityHref(project.workKind, project.id),
          status: project.status,
          presentation: project.status === 'cancelled' ? 'cancelled' : 'neutral',
          projectId: project.id,
          projectName: project.name,
          suffix: 'status',
        }),
      );
    }
  }

  for (const estimate of estimates) {
    canonical.push(
      buildEvent({
        kind: 'quote_created',
        entityType: 'estimate',
        entityId: estimate.id,
        occurredAt: estimate.createdAt,
        summary: estimate.title,
        deepLink: `/quotes/${estimate.id}`,
        actorUserId: estimate.createdByUserId,
        actorName: actorName(names, estimate.createdByUserId),
        status: estimate.status,
        presentation: estimate.status === 'draft' ? 'draft' : 'neutral',
      }),
    );
    if (estimate.sentAt) {
      canonical.push(
        buildEvent({
          kind: 'quote_submitted',
          entityType: 'estimate',
          entityId: estimate.id,
          occurredAt: estimate.sentAt,
          summary: estimate.title,
          deepLink: `/quotes/${estimate.id}`,
          status: estimate.status,
          presentation: 'pending',
          suffix: 'sent',
        }),
      );
    }
    if (estimate.status === 'accepted' && estimate.decidedAt) {
      canonical.push(
        buildEvent({
          kind: 'quote_approved',
          entityType: 'estimate',
          entityId: estimate.id,
          occurredAt: estimate.decidedAt,
          summary: estimate.title,
          deepLink: `/quotes/${estimate.id}`,
          status: estimate.status,
          presentation: 'approved',
          suffix: 'accepted',
        }),
      );
    }
    if (estimate.status === 'rejected' && estimate.decidedAt) {
      canonical.push(
        buildEvent({
          kind: 'quote_rejected',
          entityType: 'estimate',
          entityId: estimate.id,
          occurredAt: estimate.decidedAt,
          summary: estimate.title,
          deepLink: `/quotes/${estimate.id}`,
          status: estimate.status,
          presentation: 'cancelled',
          suffix: 'rejected',
        }),
      );
    }
  }

  for (const contract of contracts) {
    canonical.push(
      buildEvent({
        kind: 'contract_created',
        entityType: 'contract',
        entityId: contract.id,
        occurredAt: contract.createdAt,
        summary: contract.name || contract.reference || contract.id,
        deepLink: workEntityHref(
          projects.find((project) => project.id === contract.projectId)?.workKind ?? 'project',
          contract.projectId,
        ),
        projectId: contract.projectId,
        projectName: projectNames.get(contract.projectId) ?? null,
      }),
    );
  }

  for (const change of changeRequests) {
    canonical.push(
      buildEvent({
        kind: 'change_requested',
        entityType: 'change_request',
        entityId: change.id,
        occurredAt: change.createdAt,
        summary: change.title,
        deepLink: `/changes/${change.id}`,
        actorUserId: change.createdByUserId,
        actorName: actorName(names, change.createdByUserId),
        status: change.status,
        presentation: change.status === 'draft' ? 'draft' : 'pending',
        projectId: change.projectId,
        projectName: projectNames.get(change.projectId) ?? null,
      }),
    );
    if (change.status === 'approved' && change.decidedAt) {
      canonical.push(
        buildEvent({
          kind: 'change_approved',
          entityType: 'change_request',
          entityId: change.id,
          occurredAt: change.decidedAt,
          summary: change.title,
          deepLink: `/changes/${change.id}`,
          status: change.status,
          presentation: 'approved',
          projectId: change.projectId,
          projectName: projectNames.get(change.projectId) ?? null,
          suffix: 'approved',
        }),
      );
    }
  }

  for (const version of quoteVersions) {
    const href = version.changeRequestId
      ? `/changes/${version.changeRequestId}`
      : `/projects/${version.projectId}?tab=changes`;
    const title = version.title || `v${version.versionNumber}`;
    if (version.issuedAt || version.status === 'issued' || version.status === 'accepted') {
      canonical.push(
        buildEvent({
          kind: 'commercial_quote_issued',
          entityType: 'quote_version',
          entityId: version.id,
          occurredAt: version.issuedAt ?? version.createdAt,
          summary: title,
          deepLink: href,
          status: version.status,
          presentation: 'pending',
          projectId: version.projectId,
          projectName: projectNames.get(version.projectId) ?? null,
        }),
      );
    }
    if (version.status === 'accepted') {
      canonical.push(
        buildEvent({
          kind: 'commercial_quote_accepted',
          entityType: 'quote_version',
          entityId: version.id,
          occurredAt: version.issuedAt ?? version.createdAt,
          summary: title,
          deepLink: href,
          status: version.status,
          presentation: 'approved',
          projectId: version.projectId,
          projectName: projectNames.get(version.projectId) ?? null,
          suffix: 'accepted',
        }),
      );
    }
  }

  for (const milestone of milestones) {
    canonical.push(
      buildEvent({
        kind: 'milestone_created',
        entityType: 'project_milestone',
        entityId: milestone.id,
        occurredAt: milestone.createdAt,
        summary: milestone.name,
        deepLink: `/projects/${milestone.projectId}?tab=work`,
        status: milestone.status,
        presentation: milestone.status === 'cancelled' ? 'cancelled' : 'neutral',
        projectId: milestone.projectId,
        projectName: projectNames.get(milestone.projectId) ?? null,
      }),
    );
    if (milestone.status === 'achieved' && milestone.completedAt) {
      canonical.push(
        buildEvent({
          kind: 'milestone_achieved',
          entityType: 'project_milestone',
          entityId: milestone.id,
          occurredAt: atNoonUtc(milestone.completedAt),
          summary: milestone.name,
          deepLink: `/projects/${milestone.projectId}?tab=work`,
          status: milestone.status,
          presentation: 'approved',
          projectId: milestone.projectId,
          projectName: projectNames.get(milestone.projectId) ?? null,
          suffix: 'achieved',
        }),
      );
    }
  }

  for (const batch of boqProgress) {
    if (batch.status !== 'approved' && batch.status !== 'billed') continue;
    canonical.push(
      buildEvent({
        kind: 'boq_progress_approved',
        entityType: 'boq_progress_batch',
        entityId: batch.id,
        occurredAt: batch.approvedAt ?? batch.createdAt,
        summary: batch.periodLabel || `#${batch.certificateNumber}`,
        deepLink: `/projects/${batch.projectId}?tab=boq`,
        actorUserId: batch.approvedByUserId,
        actorName: actorName(names, batch.approvedByUserId),
        status: batch.status,
        presentation: 'approved',
        projectId: batch.projectId,
        projectName: projectNames.get(batch.projectId) ?? null,
      }),
    );
  }

  for (const record of billingRows) {
    const mapped = mapBillingStatusToTimeline(
      record.status === 'void' || record.status === 'draft' || record.status === 'finalized'
        ? record.status
        : 'draft',
    );
    const occurredAt =
      mapped.kind === 'billing_voided'
        ? (record.voidedAt ?? record.createdAt)
        : (record.finalizedAt ?? record.createdAt);
    canonical.push(
      buildEvent({
        kind: mapped.kind,
        entityType: 'billing_record',
        entityId: record.id,
        occurredAt,
        summary: record.reference || record.kind,
        deepLink: `/billing/${record.id}`,
        actorUserId: record.createdByUserId,
        actorName: actorName(names, record.createdByUserId),
        status: record.status,
        presentation: mapped.presentation,
        projectId: record.projectId,
        projectName: record.projectName,
        billingKind: record.kind,
      }),
    );
  }

  for (const payment of paymentRows) {
    if (payment.status !== 'recorded') continue;
    canonical.push(
      buildEvent({
        kind: 'payment_received',
        entityType: 'payment',
        entityId: payment.id,
        occurredAt: payment.createdAt,
        summary: payment.reference || payment.paymentDate,
        deepLink: payment.billingRecordId ? `/billing/${payment.billingRecordId}` : '/billing',
        actorUserId: payment.createdByUserId,
        actorName: actorName(names, payment.createdByUserId),
        status: payment.status,
        presentation: 'approved',
        projectId: payment.projectId,
        projectName: payment.projectName,
      }),
    );
  }

  const seenDocuments = new Set<string>();
  for (const document of documentRows) {
    if (seenDocuments.has(document.documentId)) continue;
    seenDocuments.add(document.documentId);
    const href =
      document.ownerType === 'client'
        ? `/clients/${clientId}`
        : `/projects/${document.ownerId}?tab=documents`;
    canonical.push(
      buildEvent({
        kind: 'document_uploaded',
        entityType: 'document',
        entityId: document.documentId,
        occurredAt: document.createdAt,
        summary: document.originalFilename,
        deepLink: href,
        actorUserId: document.uploadedByUserId,
        actorName: actorName(names, document.uploadedByUserId),
        presentation: 'neutral',
      }),
    );
  }

  for (const version of versions) {
    canonical.push(
      buildEvent({
        kind: 'document_versioned',
        entityType: 'document_version',
        entityId: version.id,
        occurredAt: version.uploadedAt,
        summary: version.originalFilename,
        deepLink: `/clients/${clientId}`,
        actorUserId: version.uploadedByUserId,
        actorName: actorName(names, version.uploadedByUserId),
        status: String(version.versionNumber),
        presentation: 'neutral',
      }),
    );
  }

  for (const approval of commercialApprovals) {
    canonical.push(
      buildEvent({
        kind: 'approval_decided',
        entityType: 'approval',
        entityId: approval.id,
        occurredAt: approval.decidedAt,
        summary: approval.approverName || approval.decision,
        deepLink: `/changes/${approval.targetId}`,
        actorUserId: approval.recordedByUserId,
        actorName: actorName(names, approval.recordedByUserId) ?? approval.approverName,
        status: approval.decision,
        presentation: approval.decision === 'approved' ? 'approved' : 'cancelled',
        projectId: approval.projectId,
        projectName: approval.projectId ? (projectNames.get(approval.projectId) ?? null) : null,
      }),
    );
  }

  for (const approval of quoteApprovals) {
    canonical.push(
      buildEvent({
        kind: 'approval_decided',
        entityType: 'approval_request',
        entityId: approval.id,
        occurredAt: approval.decidedAt ?? approval.createdAt,
        summary: approval.status,
        deepLink: `/quotes/${approval.entityId}`,
        actorUserId: approval.decidedByUserId ?? approval.submittedByUserId,
        actorName: actorName(names, approval.decidedByUserId ?? approval.submittedByUserId),
        status: approval.status,
        presentation: approval.status === 'approved' ? 'approved' : 'cancelled',
      }),
    );
  }

  const economicRows = corrections.map((row) => {
    const effectSide: 'cost' | 'revenue' | null =
      row.effectSide === 'cost' || row.effectSide === 'revenue' ? row.effectSide : null;
    return { ...row, effectSide };
  });
  const superseded = supersededAdjustmentIds(economicRows);
  for (const correction of economicRows) {
    if (!isEconomicAdjustment(correction)) continue;
    if (superseded.has(correction.id)) continue;
    canonical.push(
      buildEvent({
        kind: 'financial_correction',
        entityType: 'month_close_adjustment',
        entityId: correction.id,
        occurredAt: correction.createdAt,
        summary: correction.reason,
        deepLink: correction.projectId ? `/projects/${correction.projectId}?tab=financials` : null,
        actorUserId: correction.createdByUserId,
        actorName: actorName(names, correction.createdByUserId),
        presentation: 'neutral',
        projectId: correction.projectId,
        projectName: correction.projectId ? (projectNames.get(correction.projectId) ?? null) : null,
      }),
    );
  }

  const merged = mergeCanonicalAndIndexEvents(
    canonical,
    eventsFromActivityIndex(indexed, names, projectNames),
  );
  const sorted = sortTimelineEvents(merged, options.sort ?? 'newest');

  return {
    clientId: client.id,
    events: capTimelineEvents(sorted).map(serialize),
  };
}
