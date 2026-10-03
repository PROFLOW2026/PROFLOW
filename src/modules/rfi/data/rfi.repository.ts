import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  externalPrincipals,
  profiles,
  projectLocations,
  rfiAnswers,
  rfiStatusEvents,
  rfis,
  subcontractAgreements,
  vendors,
  workPackages,
} from '@drizzle/schema';
import type { ActorColumns } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import {
  RFI_AWAITING_ANSWER_STATUSES,
  type RfiAnswerView,
  type RfiDetail,
  type RfiHistoryEntry,
  type RfiListItem,
  type RfiPriority,
  type RfiStatus,
  type RfiStatusCounts,
} from '../domain/types';

/** All queries run on the caller's RLS-bound executor and are always scoped by organization. */

export type RfiRow = typeof rfis.$inferSelect;

export async function findRfiRow(db: DbExecutor, organizationId: string, rfiId: string): Promise<RfiRow | null> {
  const [row] = await db
    .select()
    .from(rfis)
    .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, rfiId)))
    .limit(1);
  return row ?? null;
}

export interface InsertRfiValues {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly subject: string;
  readonly question: string;
  readonly locationId: string | null;
  readonly drawingId: string | null;
  readonly drawingRevisionId: string | null;
  readonly drawingReference: string | null;
  readonly workPackageId: string | null;
  readonly priority: RfiPriority;
  readonly dueDate: string | null;
  readonly assigneeUserId: string | null;
  readonly status: Extract<RfiStatus, 'draft' | 'submitted'>;
  readonly submittedAt: Date | null;
  readonly raisedActorType: 'internal' | 'external';
  readonly raisedByUserId: string | null;
  readonly raisedByPrincipalId: string | null;
}

export async function insertRfi(db: DbExecutor, values: InsertRfiValues): Promise<{ id: string; number: number }> {
  const [row] = await db.insert(rfis).values(values).returning({ id: rfis.id, number: rfis.number });
  return row!;
}

export type RfiPatch = Partial<
  Pick<
    RfiRow,
    | 'subject'
    | 'question'
    | 'vendorId'
    | 'subcontractAgreementId'
    | 'locationId'
    | 'drawingId'
    | 'drawingRevisionId'
    | 'drawingReference'
    | 'workPackageId'
    | 'priority'
    | 'dueDate'
    | 'assigneeUserId'
    | 'status'
    | 'submittedAt'
    | 'answeredAt'
    | 'closedAt'
    | 'reopenCount'
  >
>;

/** Optimistic update: only applies while the row is still in `expectedStatus`. null = lost the race. */
export async function updateRfiRow(
  db: DbExecutor,
  organizationId: string,
  rfiId: string,
  expectedStatus: RfiStatus,
  patch: RfiPatch,
): Promise<RfiRow | null> {
  const [row] = await db
    .update(rfis)
    .set(patch)
    .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, rfiId), eq(rfis.status, expectedStatus)))
    .returning();
  return row ?? null;
}

export async function insertRfiStatusEvent(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    fromStatus: RfiStatus | null;
    toStatus: RfiStatus;
    reason: string | null;
    actor: ActorColumns;
  },
): Promise<void> {
  await db.insert(rfiStatusEvents).values({
    organizationId: values.organizationId,
    projectId: values.projectId,
    rfiId: values.rfiId,
    fromStatus: values.fromStatus,
    toStatus: values.toStatus,
    reason: values.reason,
    actorType: values.actor.actorType,
    actorUserId: values.actor.actorUserId,
    actorPrincipalId: values.actor.actorPrincipalId,
  });
}

export async function findLatestRfiAnswerId(
  db: DbExecutor,
  organizationId: string,
  rfiId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: rfiAnswers.id })
    .from(rfiAnswers)
    .where(and(eq(rfiAnswers.organizationId, organizationId), eq(rfiAnswers.rfiId, rfiId)))
    .orderBy(desc(rfiAnswers.createdAt), desc(rfiAnswers.id))
    .limit(1);
  return row?.id ?? null;
}

export async function insertRfiAnswer(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string;
    rfiId: string;
    body: string;
    answeredByUserId: string;
    supersedesAnswerId: string | null;
  },
): Promise<string> {
  const [row] = await db.insert(rfiAnswers).values(values).returning({ id: rfiAnswers.id });
  return row!.id;
}

export interface RfiListFilter {
  readonly organizationId: string;
  readonly projectId?: string | null;
  readonly projectIds?: readonly string[] | null;
  readonly statuses?: readonly RfiStatus[] | null;
  /** Contractor scoping: only RFIs of these vendors. */
  readonly vendorIds?: readonly string[] | null;
  /** Overdue: awaiting answer with due date strictly before this org-local date. */
  readonly overdueBefore?: string | null;
  readonly limit: number;
  readonly offset?: number;
}

function listConditions(filter: RfiListFilter): SQL[] {
  const conditions: SQL[] = [eq(rfis.organizationId, filter.organizationId), isNull(rfis.archivedAt)];
  if (filter.projectId) conditions.push(eq(rfis.projectId, filter.projectId));
  if (filter.projectIds) conditions.push(inArray(rfis.projectId, [...filter.projectIds]));
  if (filter.statuses && filter.statuses.length > 0) conditions.push(inArray(rfis.status, [...filter.statuses]));
  if (filter.vendorIds) conditions.push(inArray(rfis.vendorId, [...filter.vendorIds]));
  if (filter.overdueBefore) {
    conditions.push(inArray(rfis.status, [...RFI_AWAITING_ANSWER_STATUSES]));
    conditions.push(isNotNull(rfis.dueDate));
    conditions.push(lt(rfis.dueDate, filter.overdueBefore));
  }
  return conditions;
}

const assignee = alias(profiles, 'rfi_assignee');

export async function listRfiRows(db: DbExecutor, filter: RfiListFilter): Promise<RfiListItem[]> {
  if ((filter.vendorIds && filter.vendorIds.length === 0) || (filter.projectIds && filter.projectIds.length === 0)) {
    return [];
  }
  const rows = await db
    .select({
      id: rfis.id,
      projectId: rfis.projectId,
      number: rfis.number,
      subject: rfis.subject,
      status: rfis.status,
      priority: rfis.priority,
      dueDate: rfis.dueDate,
      vendorId: rfis.vendorId,
      subcontractAgreementId: rfis.subcontractAgreementId,
      vendorName: vendors.name,
      locationId: rfis.locationId,
      locationName: projectLocations.name,
      assigneeUserId: rfis.assigneeUserId,
      assigneeName: assignee.displayName,
      raisedActorType: rfis.raisedActorType,
      submittedAt: rfis.submittedAt,
      answeredAt: rfis.answeredAt,
      createdAt: rfis.createdAt,
    })
    .from(rfis)
    .leftJoin(vendors, and(eq(vendors.id, rfis.vendorId), eq(vendors.organizationId, rfis.organizationId)))
    .leftJoin(
      projectLocations,
      and(eq(projectLocations.id, rfis.locationId), eq(projectLocations.organizationId, rfis.organizationId)),
    )
    .leftJoin(assignee, eq(assignee.id, rfis.assigneeUserId))
    .where(and(...listConditions(filter)))
    .orderBy(desc(rfis.number))
    .limit(filter.limit)
    .offset(filter.offset ?? 0);
  return rows;
}

export async function countRfisByStatus(
  db: DbExecutor,
  filter: Omit<RfiListFilter, 'limit' | 'offset' | 'statuses' | 'overdueBefore'>,
): Promise<RfiStatusCounts> {
  const counts: Record<RfiStatus, number> = { draft: 0, submitted: 0, under_review: 0, answered: 0, closed: 0 };
  if ((filter.vendorIds && filter.vendorIds.length === 0) || (filter.projectIds && filter.projectIds.length === 0)) {
    return counts;
  }
  const rows = await db
    .select({ status: rfis.status, total: count() })
    .from(rfis)
    .where(and(...listConditions({ ...filter, limit: 0 })))
    .groupBy(rfis.status);
  for (const row of rows) counts[row.status] = Number(row.total);
  return counts;
}

export async function countOverdueRfiRows(
  db: DbExecutor,
  filter: Omit<RfiListFilter, 'limit' | 'offset' | 'statuses'> & { overdueBefore: string },
): Promise<number> {
  if ((filter.vendorIds && filter.vendorIds.length === 0) || (filter.projectIds && filter.projectIds.length === 0)) {
    return 0;
  }
  const [row] = await db
    .select({ total: count() })
    .from(rfis)
    .where(and(...listConditions({ ...filter, limit: 0 })));
  return Number(row?.total ?? 0);
}

const raisedBy = alias(profiles, 'rfi_raised_by');
const answerer = alias(profiles, 'rfi_answerer');
const historyActor = alias(profiles, 'rfi_history_actor');
const historyPrincipal = alias(externalPrincipals, 'rfi_history_principal');

export async function loadRfiDetail(
  db: DbExecutor,
  organizationId: string,
  rfiId: string,
  options: { includeInternalNames: boolean },
): Promise<RfiDetail | null> {
  const [row] = await db
    .select({
      rfi: rfis,
      vendorName: vendors.name,
      agreementTitle: subcontractAgreements.title,
      locationName: projectLocations.name,
      workPackageName: workPackages.name,
      assigneeName: assignee.displayName,
      raisedByName: raisedBy.displayName,
      raisedByPrincipalName: externalPrincipals.displayName,
    })
    .from(rfis)
    .leftJoin(vendors, and(eq(vendors.id, rfis.vendorId), eq(vendors.organizationId, rfis.organizationId)))
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, rfis.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, rfis.organizationId),
      ),
    )
    .leftJoin(
      projectLocations,
      and(eq(projectLocations.id, rfis.locationId), eq(projectLocations.organizationId, rfis.organizationId)),
    )
    .leftJoin(
      workPackages,
      and(eq(workPackages.id, rfis.workPackageId), eq(workPackages.organizationId, rfis.organizationId)),
    )
    .leftJoin(assignee, eq(assignee.id, rfis.assigneeUserId))
    .leftJoin(raisedBy, eq(raisedBy.id, rfis.raisedByUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, rfis.raisedByPrincipalId))
    .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, rfiId)))
    .limit(1);
  if (!row) return null;

  const answerRows = await db
      .select({
        id: rfiAnswers.id,
        body: rfiAnswers.body,
        answeredByName: answerer.displayName,
        supersedesAnswerId: rfiAnswers.supersedesAnswerId,
        createdAt: rfiAnswers.createdAt,
      })
      .from(rfiAnswers)
      .leftJoin(answerer, eq(answerer.id, rfiAnswers.answeredByUserId))
      .where(and(eq(rfiAnswers.organizationId, organizationId), eq(rfiAnswers.rfiId, rfiId)))
      .orderBy(asc(rfiAnswers.createdAt), asc(rfiAnswers.id))
      .limit(100);
  const historyRows = await db
      .select({
        id: rfiStatusEvents.id,
        fromStatus: rfiStatusEvents.fromStatus,
        toStatus: rfiStatusEvents.toStatus,
        reason: rfiStatusEvents.reason,
        actorType: rfiStatusEvents.actorType,
        actorName: historyActor.displayName,
        principalName: historyPrincipal.displayName,
        createdAt: rfiStatusEvents.createdAt,
      })
      .from(rfiStatusEvents)
      .leftJoin(historyActor, eq(historyActor.id, rfiStatusEvents.actorUserId))
      .leftJoin(historyPrincipal, eq(historyPrincipal.id, rfiStatusEvents.actorPrincipalId))
      .where(and(eq(rfiStatusEvents.organizationId, organizationId), eq(rfiStatusEvents.rfiId, rfiId)))
      .orderBy(asc(rfiStatusEvents.createdAt), asc(rfiStatusEvents.id))
      .limit(200);

  const internalNames = options.includeInternalNames;
  const answers: RfiAnswerView[] = answerRows.map((answer) => ({
    ...answer,
    answeredByName: internalNames ? answer.answeredByName : null,
  }));
  const history: RfiHistoryEntry[] = historyRows.map((entry) => ({
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    reason: entry.reason,
    actorType: entry.actorType,
    actorName:
      entry.actorType === 'external' ? entry.principalName : internalNames ? entry.actorName : null,
    createdAt: entry.createdAt,
  }));

  const rfi = row.rfi;
  return {
    id: rfi.id,
    organizationId: rfi.organizationId,
    projectId: rfi.projectId,
    number: rfi.number,
    subject: rfi.subject,
    question: rfi.question,
    status: rfi.status,
    priority: rfi.priority,
    dueDate: rfi.dueDate,
    vendorId: rfi.vendorId,
    vendorName: row.vendorName,
    subcontractAgreementId: rfi.subcontractAgreementId,
    agreementTitle: row.agreementTitle,
    locationId: rfi.locationId,
    locationName: row.locationName,
    drawingId: rfi.drawingId,
    drawingRevisionId: rfi.drawingRevisionId,
    drawingReference: rfi.drawingReference,
    workPackageId: rfi.workPackageId,
    workPackageName: row.workPackageName,
    assigneeUserId: internalNames ? rfi.assigneeUserId : null,
    assigneeName: internalNames ? row.assigneeName : null,
    raisedActorType: rfi.raisedActorType,
    raisedByName: rfi.raisedActorType === 'external' ? row.raisedByPrincipalName : internalNames ? row.raisedByName : null,
    submittedAt: rfi.submittedAt,
    answeredAt: rfi.answeredAt,
    closedAt: rfi.closedAt,
    reopenCount: rfi.reopenCount,
    createdAt: rfi.createdAt,
    answers,
    history,
  };
}
