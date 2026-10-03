import { and, asc, count, desc, eq, inArray, isNull, lt, max, sql, type SQL } from 'drizzle-orm';
import {
  defectCycleRecords,
  defects,
  externalPrincipals,
  profiles,
  projectLocations,
  projects,
  qualityInspectionItems,
  qualityInspections,
  subcontractWorkLines,
} from '@drizzle/schema';
import { projectVendorNames } from './quality-refs.repository';
import { actorColumns, type Actor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import {
  DEFECT_ACTIVE_STATUSES,
  DEFECT_AWAITING_VERIFICATION_STATUSES,
  isDefectOverdue,
  statusesForFilter,
  type DefectCycleRecordKind,
  type DefectMode,
  type DefectSeverity,
  type DefectStatus,
} from '../domain/lifecycle';
import type {
  DefectCycleRecordView,
  DefectDetail,
  DefectListFilters,
  DefectListItem,
  DefectListPage,
  DefectStatusCounts,
} from '../domain/types';

export type DefectAudience = 'internal' | 'external';

export type DefectRow = typeof defects.$inferSelect;

export const DEFECT_PAGE_SIZE = 50;

export async function maxDefectReference(db: DbExecutor, organizationId: string, projectId: string): Promise<number> {
  const [row] = await db
    .select({ value: max(defects.referenceNo) })
    .from(defects)
    .where(and(eq(defects.organizationId, organizationId), eq(defects.projectId, projectId)));
  return row?.value ?? 0;
}

export async function insertDefectRow(db: DbExecutor, values: typeof defects.$inferInsert): Promise<void> {
  await db.insert(defects).values(values);
}

export interface CycleRecordInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly defectId: string;
  readonly cycleNo: number;
  readonly kind: DefectCycleRecordKind;
  readonly fromStatus: DefectStatus | null;
  readonly toStatus: DefectStatus | null;
  readonly note?: string | null;
  readonly internalOnly?: boolean;
  readonly details?: Record<string, unknown>;
  readonly actor: Actor;
}

/** No RETURNING: external principals append records they may not be able to read back. */
export async function insertCycleRecord(db: DbExecutor, input: CycleRecordInput): Promise<void> {
  const actor = actorColumns(input.actor);
  await db.insert(defectCycleRecords).values({
    organizationId: input.organizationId,
    projectId: input.projectId,
    defectId: input.defectId,
    cycleNo: input.cycleNo,
    kind: input.kind,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    note: input.note ?? null,
    internalOnly: input.internalOnly ?? false,
    details: input.details ?? {},
    actorType: actor.actorType,
    actorUserId: actor.actorUserId,
    actorPrincipalId: actor.actorPrincipalId,
  });
}

export async function findDefectRow(
  db: DbExecutor,
  organizationId: string,
  defectId: string,
): Promise<DefectRow | null> {
  const [row] = await db
    .select()
    .from(defects)
    .where(and(eq(defects.organizationId, organizationId), eq(defects.id, defectId), isNull(defects.archivedAt)))
    .limit(1);
  return row ?? null;
}

/** Compare-and-set on status so concurrent decisions cannot both win. Returns false on conflict. */
export async function updateDefectRow(
  db: DbExecutor,
  organizationId: string,
  defectId: string,
  expectedStatus: DefectStatus,
  patch: Partial<typeof defects.$inferInsert>,
): Promise<boolean> {
  const rows = await db
    .update(defects)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(defects.organizationId, organizationId),
        eq(defects.id, defectId),
        eq(defects.status, expectedStatus),
      ),
    )
    .returning({ id: defects.id });
  return rows.length > 0;
}

interface ListScope {
  readonly organizationId: string;
  readonly projectId?: string | null;
  /** External scoping: only these vendors (grant vendors). */
  readonly vendorIds?: readonly string[] | null;
}

function listConditions(scope: ListScope, filters: DefectListFilters, today: string): SQL[] {
  const conditions: SQL[] = [eq(defects.organizationId, scope.organizationId), isNull(defects.archivedAt)];
  if (scope.projectId) conditions.push(eq(defects.projectId, scope.projectId));
  if (scope.vendorIds) conditions.push(inArray(defects.vendorId, [...scope.vendorIds]));
  const statuses = statusesForFilter(filters.status ?? 'all');
  if (statuses) conditions.push(inArray(defects.status, [...statuses]));
  if (filters.severity) conditions.push(eq(defects.severity, filters.severity));
  if (filters.vendorId) conditions.push(eq(defects.vendorId, filters.vendorId));
  if (filters.locationId) conditions.push(eq(defects.locationId, filters.locationId));
  if (filters.mode) conditions.push(eq(defects.mode, filters.mode));
  if (filters.sourceInspectionId) conditions.push(eq(defects.sourceInspectionId, filters.sourceInspectionId));
  if (filters.overdueOnly) {
    conditions.push(inArray(defects.status, [...DEFECT_ACTIVE_STATUSES]));
    conditions.push(lt(defects.dueDate, today));
  }
  return conditions;
}

const severityOrder = sql`CASE ${defects.severity} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;

export async function listDefectRows(
  db: DbExecutor,
  scope: ListScope,
  filters: DefectListFilters,
  audience: DefectAudience,
  today: string,
): Promise<DefectListPage> {
  const limit = Math.min(Math.max(filters.limit ?? DEFECT_PAGE_SIZE, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const conditions = listConditions(scope, filters, today);

  const base = db
    .select({
      id: defects.id,
      projectId: defects.projectId,
      referenceNo: defects.referenceNo,
      title: defects.title,
      severity: defects.severity,
      status: defects.status,
      mode: defects.mode,
      dueDate: defects.dueDate,
      cycleNo: defects.cycleNo,
      locationId: defects.locationId,
      locationName: projectLocations.name,
      vendorId: defects.vendorId,
      subcontractAgreementId: defects.subcontractAgreementId,
      lastSubmittedAt: defects.lastSubmittedAt,
      closedAt: defects.closedAt,
      createdAt: defects.createdAt,
      assigneeUserId: defects.assigneeUserId,
    })
    .from(defects)
    .leftJoin(
      projectLocations,
      and(eq(projectLocations.id, defects.locationId), eq(projectLocations.organizationId, defects.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(severityOrder, asc(defects.dueDate), desc(defects.referenceNo))
    .limit(limit + 1)
    .offset(offset);

  const rows = await base;
  const page = rows.slice(0, limit);

  const vendorNames = new Map<string, string>();
  const assigneeNames = new Map<string, string>();
  if (audience === 'internal') {
    const projectIds = [...new Set(page.filter((row) => row.vendorId).map((row) => row.projectId))];
    for (const projectId of projectIds) {
      for (const [id, name] of await projectVendorNames(db, scope.organizationId, projectId)) vendorNames.set(id, name);
    }
    const userIds = [...new Set(page.map((row) => row.assigneeUserId).filter((id): id is string => Boolean(id)))];
    if (userIds.length > 0) {
      const userRows = await db
        .select({ id: profiles.id, displayName: profiles.displayName, email: profiles.email })
        .from(profiles)
        .where(inArray(profiles.id, userIds));
      for (const row of userRows) assigneeNames.set(row.id, row.displayName ?? row.email);
    }
  }

  const items: DefectListItem[] = page.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    referenceNo: row.referenceNo,
    title: row.title,
    severity: row.severity as DefectSeverity,
    status: row.status as DefectStatus,
    mode: row.mode as DefectMode,
    dueDate: row.dueDate,
    cycleNo: row.cycleNo,
    location: row.locationId && row.locationName ? { id: row.locationId, name: row.locationName } : null,
    vendor:
      audience === 'internal' && row.vendorId
        ? { id: row.vendorId, name: vendorNames.get(row.vendorId) ?? '' }
        : null,
    subcontractAgreementId: row.subcontractAgreementId,
    assigneeName: row.assigneeUserId ? (assigneeNames.get(row.assigneeUserId) ?? null) : null,
    lastSubmittedAt: row.lastSubmittedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    overdue: isDefectOverdue({ status: row.status as DefectStatus, dueDate: row.dueDate }, today),
  }));
  return { items, hasMore: rows.length > limit };
}

export async function countDefectsByStatus(
  db: DbExecutor,
  scope: ListScope,
  today: string,
): Promise<DefectStatusCounts> {
  const conditions: SQL[] = [eq(defects.organizationId, scope.organizationId), isNull(defects.archivedAt)];
  if (scope.projectId) conditions.push(eq(defects.projectId, scope.projectId));
  if (scope.vendorIds) conditions.push(inArray(defects.vendorId, [...scope.vendorIds]));
  const rows = await db
    .select({
      status: defects.status,
      total: count(),
      overdue: sql<number>`count(*) FILTER (WHERE ${defects.dueDate} < ${today})`.mapWith(Number),
    })
    .from(defects)
    .where(and(...conditions))
    .groupBy(defects.status);
  const byStatus = new Map(rows.map((row) => [row.status as DefectStatus, row] as const));
  const get = (status: DefectStatus) => Number(byStatus.get(status)?.total ?? 0);
  const overdue = DEFECT_ACTIVE_STATUSES.reduce((sum, status) => sum + Number(byStatus.get(status)?.overdue ?? 0), 0);
  return {
    open: get('open'),
    assigned: get('assigned'),
    reopened: get('reopened'),
    awaitingVerification: DEFECT_AWAITING_VERIFICATION_STATUSES.reduce((sum, status) => sum + get(status), 0),
    closed: get('closed'),
    overdue,
  };
}

export async function listCycleRecords(
  db: DbExecutor,
  organizationId: string,
  defectId: string,
  audience: DefectAudience,
): Promise<DefectCycleRecordView[]> {
  const conditions: SQL[] = [
    eq(defectCycleRecords.organizationId, organizationId),
    eq(defectCycleRecords.defectId, defectId),
  ];
  if (audience === 'external') conditions.push(eq(defectCycleRecords.internalOnly, false));

  if (audience === 'external') {
    const rows = await db
      .select()
      .from(defectCycleRecords)
      .where(and(...conditions))
      .orderBy(asc(defectCycleRecords.createdAt));
    return rows.map((row) => ({
      id: row.id,
      cycleNo: row.cycleNo,
      kind: row.kind,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      internalOnly: row.internalOnly,
      details: row.details,
      actorType: row.actorType,
      actorName: null,
      createdAt: row.createdAt,
    }));
  }

  const rows = await db
    .select({
      record: defectCycleRecords,
      userName: profiles.displayName,
      userEmail: profiles.email,
      principalName: externalPrincipals.displayName,
      principalEmail: externalPrincipals.email,
    })
    .from(defectCycleRecords)
    .leftJoin(profiles, eq(profiles.id, defectCycleRecords.actorUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, defectCycleRecords.actorPrincipalId))
    .where(and(...conditions))
    .orderBy(asc(defectCycleRecords.createdAt));
  return rows.map(({ record, userName, userEmail, principalName, principalEmail }) => ({
    id: record.id,
    cycleNo: record.cycleNo,
    kind: record.kind,
    fromStatus: record.fromStatus,
    toStatus: record.toStatus,
    note: record.note,
    internalOnly: record.internalOnly,
    details: record.details,
    actorType: record.actorType,
    actorName:
      record.actorType === 'internal'
        ? (userName ?? userEmail ?? null)
        : record.actorType === 'external'
          ? (principalName ?? principalEmail ?? null)
          : null,
    createdAt: record.createdAt,
  }));
}

export async function loadDefectDetail(
  db: DbExecutor,
  row: DefectRow,
  audience: DefectAudience,
  today: string,
): Promise<DefectDetail> {
  const organizationId = row.organizationId;
  const [location] = row.locationId
    ? await db
        .select({ id: projectLocations.id, name: projectLocations.name })
        .from(projectLocations)
        .where(and(eq(projectLocations.organizationId, organizationId), eq(projectLocations.id, row.locationId)))
        .limit(1)
    : [];
  const [workLine] = row.workLineId
    ? await db
        .select({
          id: subcontractWorkLines.id,
          code: subcontractWorkLines.code,
          description: subcontractWorkLines.description,
        })
        .from(subcontractWorkLines)
        .where(
          and(eq(subcontractWorkLines.organizationId, organizationId), eq(subcontractWorkLines.id, row.workLineId)),
        )
        .limit(1)
    : [];
  const [inspection] = row.sourceInspectionId
    ? await db
        .select({
          id: qualityInspections.id,
          referenceNo: qualityInspections.referenceNo,
          title: qualityInspections.title,
        })
        .from(qualityInspections)
        .where(
          and(eq(qualityInspections.organizationId, organizationId), eq(qualityInspections.id, row.sourceInspectionId)),
        )
        .limit(1)
    : [];
  const [item] = row.sourceInspectionItemId
    ? await db
        .select({ label: qualityInspectionItems.label })
        .from(qualityInspectionItems)
        .where(
          and(
            eq(qualityInspectionItems.organizationId, organizationId),
            eq(qualityInspectionItems.id, row.sourceInspectionItemId),
          ),
        )
        .limit(1)
    : [];

  let vendor: { id: string; name: string } | null = null;
  let assigneeName: string | null = null;
  let inspectorName: string | null = null;
  if (audience === 'internal') {
    if (row.vendorId) {
      const names = await projectVendorNames(db, organizationId, row.projectId);
      vendor = { id: row.vendorId, name: names.get(row.vendorId) ?? '' };
    }
    const userIds = [row.assigneeUserId, row.inspectorUserId].filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      const users = await db
        .select({ id: profiles.id, displayName: profiles.displayName, email: profiles.email })
        .from(profiles)
        .where(inArray(profiles.id, userIds));
      const names = new Map(users.map((user) => [user.id, user.displayName ?? user.email] as const));
      assigneeName = row.assigneeUserId ? (names.get(row.assigneeUserId) ?? null) : null;
      inspectorName = row.inspectorUserId ? (names.get(row.inspectorUserId) ?? null) : null;
    }
  }

  const records = await listCycleRecords(db, organizationId, row.id, audience);

  return {
    id: row.id,
    organizationId,
    projectId: row.projectId,
    referenceNo: row.referenceNo,
    title: row.title,
    description: row.description,
    category: row.category,
    severity: row.severity,
    status: row.status,
    mode: row.mode,
    dueDate: row.dueDate,
    cycleNo: row.cycleNo,
    location: location ?? null,
    locationId: row.locationId,
    vendor,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    workLine: workLine ?? null,
    assigneeUserId: row.assigneeUserId,
    assigneeName,
    inspectorUserId: row.inspectorUserId,
    inspectorName,
    sourceInspection: inspection ?? null,
    sourceInspectionItemLabel: item?.label ?? null,
    warrantySource:
      row.warrantySourceType && row.warrantySourceId ? { type: row.warrantySourceType, id: row.warrantySourceId } : null,
    contractorVisible: row.contractorVisible,
    lastSubmittedAt: row.lastSubmittedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    overdue: isDefectOverdue({ status: row.status, dueDate: row.dueDate }, today),
    records,
  };
}

export interface AwaitingVerificationRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly severity: DefectSeverity;
  readonly status: DefectStatus;
  readonly cycleNo: number;
  readonly vendorName: string | null;
  readonly lastSubmittedAt: Date | null;
}

/** RLS-scoped (project.view) org-wide scan of the partial index defects_awaiting_verification_idx. */
export async function listAwaitingVerificationRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string | null,
  limit: number,
  projectIds?: readonly string[] | null,
): Promise<AwaitingVerificationRow[]> {
  if (projectIds && projectIds.length === 0) return [];
  const conditions: SQL[] = [
    eq(defects.organizationId, organizationId),
    isNull(defects.archivedAt),
    inArray(defects.status, [...DEFECT_AWAITING_VERIFICATION_STATUSES]),
  ];
  if (projectId) conditions.push(eq(defects.projectId, projectId));
  if (projectIds && projectIds.length > 0) conditions.push(inArray(defects.projectId, [...projectIds]));
  const rows = await db
    .select({
      id: defects.id,
      projectId: defects.projectId,
      projectName: projects.name,
      referenceNo: defects.referenceNo,
      title: defects.title,
      severity: defects.severity,
      status: defects.status,
      cycleNo: defects.cycleNo,
      vendorId: defects.vendorId,
      lastSubmittedAt: defects.lastSubmittedAt,
    })
    .from(defects)
    .innerJoin(projects, and(eq(projects.id, defects.projectId), eq(projects.organizationId, defects.organizationId)))
    .where(and(...conditions))
    .orderBy(asc(defects.lastSubmittedAt))
    .limit(limit);
  const names = new Map<string, Map<string, string>>();
  for (const projectId of new Set(rows.filter((row) => row.vendorId).map((row) => row.projectId))) {
    names.set(projectId, await projectVendorNames(db, organizationId, projectId));
  }
  return rows.map(({ vendorId, ...row }) => ({
    ...row,
    vendorName: vendorId ? (names.get(row.projectId)?.get(vendorId) ?? null) : null,
  }));
}

export interface MetricsDefectSourceRow {
  readonly vendorId: string | null;
  readonly status: DefectStatus;
  readonly severity: DefectSeverity;
  readonly cycleNo: number;
  readonly dueDate: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
}

export async function listDefectsForMetrics(
  db: DbExecutor,
  organizationId: string,
  vendorIds: readonly string[],
  projectId: string | null,
): Promise<MetricsDefectSourceRow[]> {
  if (vendorIds.length === 0) return [];
  const conditions: SQL[] = [
    eq(defects.organizationId, organizationId),
    inArray(defects.vendorId, [...vendorIds]),
    isNull(defects.archivedAt),
  ];
  if (projectId) conditions.push(eq(defects.projectId, projectId));
  return db
    .select({
      vendorId: defects.vendorId,
      status: defects.status,
      severity: defects.severity,
      cycleNo: defects.cycleNo,
      dueDate: defects.dueDate,
      createdAt: defects.createdAt,
      closedAt: defects.closedAt,
    })
    .from(defects)
    .where(and(...conditions))
    .limit(20000);
}
