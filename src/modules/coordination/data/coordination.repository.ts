import { and, asc, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import {
  coordinationEventDocuments,
  coordinationEventParticipants,
  coordinationEvents,
  coordinationIssues,
  coordinationOutcomes,
  coordinationReadinessOverrides,
  coordinationReschedules,
  coordinationResponses,
  documentLinks,
  documents,
  phases,
  profiles,
  projectLocations,
  workPackages,
  type CoordinationEventStatus,
  type CoordinationOverrideDecision,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Coordination repository. Every query takes the caller's RLS-bound executor and an explicit
 * organization id; RLS is the second line of defence, never the only one.
 */

export type CoordinationEventRow = typeof coordinationEvents.$inferSelect;
export type CoordinationParticipantRow = typeof coordinationEventParticipants.$inferSelect;
export type CoordinationResponseRow = typeof coordinationResponses.$inferSelect;
export type CoordinationIssueRow = typeof coordinationIssues.$inferSelect;

export async function findEvent(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<CoordinationEventRow | null> {
  const [row] = await db
    .select()
    .from(coordinationEvents)
    .where(and(eq(coordinationEvents.id, eventId), eq(coordinationEvents.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export interface EventListRow extends CoordinationEventRow {
  readonly locationName: string | null;
}

export async function listEvents(
  db: DbExecutor,
  organizationId: string,
  filter: {
    readonly projectId?: string;
    readonly eventIds?: readonly string[];
    readonly statuses?: readonly CoordinationEventStatus[];
    readonly from?: Date | null;
    readonly to?: Date | null;
    readonly order?: 'asc' | 'desc';
    readonly limit: number;
    readonly offset?: number;
  },
): Promise<EventListRow[]> {
  const conditions: SQL[] = [eq(coordinationEvents.organizationId, organizationId)];
  if (filter.projectId) conditions.push(eq(coordinationEvents.projectId, filter.projectId));
  if (filter.statuses) {
    if (filter.statuses.length === 0) return [];
    conditions.push(inArray(coordinationEvents.status, [...filter.statuses]));
  }
  if (filter.eventIds) {
    if (filter.eventIds.length === 0) return [];
    conditions.push(inArray(coordinationEvents.id, [...filter.eventIds]));
  }
  if (filter.from) conditions.push(gte(coordinationEvents.startsAt, filter.from));
  if (filter.to) conditions.push(lt(coordinationEvents.startsAt, filter.to));
  const rows = await db
    .select({ event: coordinationEvents, locationName: projectLocations.name })
    .from(coordinationEvents)
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, coordinationEvents.locationId),
        eq(projectLocations.organizationId, coordinationEvents.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      filter.order === 'desc' ? desc(coordinationEvents.startsAt) : asc(coordinationEvents.startsAt),
      asc(coordinationEvents.id),
    )
    .limit(filter.limit)
    .offset(filter.offset ?? 0);
  return rows.map((row) => ({ ...row.event, locationName: row.locationName }));
}

export interface EventContextNames {
  readonly locationName: string | null;
  readonly workPackageName: string | null;
  readonly phaseName: string | null;
}

/** Internal only (work packages / phases are not visible to external principals). */
export async function loadEventContextNames(
  db: DbExecutor,
  event: CoordinationEventRow,
): Promise<EventContextNames> {
  const [location] = event.locationId
    ? await db
        .select({ name: projectLocations.name })
        .from(projectLocations)
        .where(
          and(eq(projectLocations.id, event.locationId), eq(projectLocations.organizationId, event.organizationId)),
        )
        .limit(1)
    : [];
  const [workPackage] = event.workPackageId
    ? await db
        .select({ name: workPackages.name })
        .from(workPackages)
        .where(and(eq(workPackages.id, event.workPackageId), eq(workPackages.organizationId, event.organizationId)))
        .limit(1)
    : [];
  const [phase] = event.phaseId
    ? await db
        .select({ name: phases.name })
        .from(phases)
        .where(and(eq(phases.id, event.phaseId), eq(phases.organizationId, event.organizationId)))
        .limit(1)
    : [];
  return {
    locationName: location?.name ?? null,
    workPackageName: workPackage?.name ?? null,
    phaseName: phase?.name ?? null,
  };
}

export async function loadLocationName(
  db: DbExecutor,
  organizationId: string,
  locationId: string | null,
): Promise<string | null> {
  if (!locationId) return null;
  const [location] = await db
    .select({ name: projectLocations.name })
    .from(projectLocations)
    .where(and(eq(projectLocations.id, locationId), eq(projectLocations.organizationId, organizationId)))
    .limit(1);
  return location?.name ?? null;
}

/** Which of the optional project references exist in THIS project (composite FKs would reject the rest). */
export async function findInvalidProjectRefs(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  refs: { locationId?: string | null; workPackageId?: string | null; phaseId?: string | null },
): Promise<('locationId' | 'workPackageId' | 'phaseId')[]> {
  const invalid: ('locationId' | 'workPackageId' | 'phaseId')[] = [];
  if (refs.locationId) {
    const [row] = await db
      .select({ id: projectLocations.id })
      .from(projectLocations)
      .where(
        and(
          eq(projectLocations.id, refs.locationId),
          eq(projectLocations.organizationId, organizationId),
          eq(projectLocations.projectId, projectId),
        ),
      )
      .limit(1);
    if (!row) invalid.push('locationId');
  }
  if (refs.workPackageId) {
    const [row] = await db
      .select({ id: workPackages.id })
      .from(workPackages)
      .where(
        and(
          eq(workPackages.id, refs.workPackageId),
          eq(workPackages.organizationId, organizationId),
          eq(workPackages.projectId, projectId),
        ),
      )
      .limit(1);
    if (!row) invalid.push('workPackageId');
  }
  if (refs.phaseId) {
    const [row] = await db
      .select({ id: phases.id })
      .from(phases)
      .where(and(eq(phases.id, refs.phaseId), eq(phases.organizationId, organizationId), eq(phases.projectId, projectId)))
      .limit(1);
    if (!row) invalid.push('phaseId');
  }
  return invalid;
}

export interface ProjectStructureOptions {
  readonly locations: { id: string; name: string; parentId: string | null; type: string }[];
  readonly workPackages: { id: string; name: string }[];
  readonly phases: { id: string; name: string; workPackageId: string }[];
}

export async function listProjectStructureOptions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectStructureOptions> {
  const locations = await db
    .select({
      id: projectLocations.id,
      name: projectLocations.name,
      parentId: projectLocations.parentId,
      type: projectLocations.type,
    })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        eq(projectLocations.isActive, true),
        isNull(projectLocations.archivedAt),
      ),
    )
    .orderBy(asc(projectLocations.sortOrder), asc(projectLocations.name))
    .limit(500);
  const packages = await db
    .select({ id: workPackages.id, name: workPackages.name })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name))
    .limit(200);
  const phaseRows = await db
    .select({ id: phases.id, name: phases.name, workPackageId: phases.workPackageId })
    .from(phases)
    .where(and(eq(phases.organizationId, organizationId), eq(phases.projectId, projectId), isNull(phases.archivedAt)))
    .orderBy(asc(phases.sortOrder), asc(phases.name))
    .limit(500);
  return { locations, workPackages: packages, phases: phaseRows };
}

export async function insertEvent(
  db: DbExecutor,
  values: typeof coordinationEvents.$inferInsert,
): Promise<void> {
  await db.insert(coordinationEvents).values(values);
}

export async function updateEvent(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
  patch: Partial<typeof coordinationEvents.$inferInsert> & { resetReadinessEpoch?: boolean },
): Promise<void> {
  const { resetReadinessEpoch, ...values } = patch;
  await db
    .update(coordinationEvents)
    .set({
      ...values,
      ...(resetReadinessEpoch ? { readinessEpochAt: sql`clock_timestamp()` } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(coordinationEvents.id, eventId), eq(coordinationEvents.organizationId, organizationId)));
}

// ── participants ────────────────────────────────────────────────────────────

export async function listParticipants(
  db: DbExecutor,
  organizationId: string,
  eventIds: readonly string[],
  options: { readonly includeRemoved?: boolean } = {},
): Promise<CoordinationParticipantRow[]> {
  if (eventIds.length === 0) return [];
  return db
    .select()
    .from(coordinationEventParticipants)
    .where(
      and(
        eq(coordinationEventParticipants.organizationId, organizationId),
        inArray(coordinationEventParticipants.eventId, [...eventIds]),
        options.includeRemoved ? undefined : isNull(coordinationEventParticipants.removedAt),
      ),
    )
    .orderBy(asc(coordinationEventParticipants.createdAt), asc(coordinationEventParticipants.id));
}

export async function findParticipant(
  db: DbExecutor,
  organizationId: string,
  participantId: string,
): Promise<CoordinationParticipantRow | null> {
  const [row] = await db
    .select()
    .from(coordinationEventParticipants)
    .where(
      and(
        eq(coordinationEventParticipants.id, participantId),
        eq(coordinationEventParticipants.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertParticipants(
  db: DbExecutor,
  values: readonly (typeof coordinationEventParticipants.$inferInsert)[],
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(coordinationEventParticipants).values([...values]);
}

export async function updateParticipant(
  db: DbExecutor,
  organizationId: string,
  participantId: string,
  patch: Partial<
    Pick<
      typeof coordinationEventParticipants.$inferInsert,
      'isRequired' | 'removedAt' | 'removedByUserId' | 'readinessRequestedAt'
    >
  >,
): Promise<void> {
  await db
    .update(coordinationEventParticipants)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(coordinationEventParticipants.id, participantId),
        eq(coordinationEventParticipants.organizationId, organizationId),
      ),
    );
}

export async function markReadinessRequested(
  db: DbExecutor,
  organizationId: string,
  participantIds: readonly string[],
  at: Date,
): Promise<void> {
  if (participantIds.length === 0) return;
  await db
    .update(coordinationEventParticipants)
    .set({ readinessRequestedAt: at, updatedAt: at })
    .where(
      and(
        eq(coordinationEventParticipants.organizationId, organizationId),
        inArray(coordinationEventParticipants.id, [...participantIds]),
      ),
    );
}

// ── responses ───────────────────────────────────────────────────────────────

export interface ResponseWithActorRow extends CoordinationResponseRow {
  readonly actorDisplayName: string | null;
}

export async function listResponses(
  db: DbExecutor,
  organizationId: string,
  eventIds: readonly string[],
  options: { readonly withActorNames?: boolean } = {},
): Promise<ResponseWithActorRow[]> {
  if (eventIds.length === 0) return [];
  const where = and(
    eq(coordinationResponses.organizationId, organizationId),
    inArray(coordinationResponses.eventId, [...eventIds]),
  );
  if (!options.withActorNames) {
    const rows = await db
      .select()
      .from(coordinationResponses)
      .where(where)
      .orderBy(desc(coordinationResponses.createdAt), desc(coordinationResponses.id));
    return rows.map((row) => ({ ...row, actorDisplayName: null }));
  }
  const rows = await db
    .select({ response: coordinationResponses, displayName: profiles.displayName, email: profiles.email })
    .from(coordinationResponses)
    .leftJoin(profiles, eq(profiles.id, coordinationResponses.actorUserId))
    .where(where)
    .orderBy(desc(coordinationResponses.createdAt), desc(coordinationResponses.id));
  return rows.map((row) => ({ ...row.response, actorDisplayName: row.displayName ?? row.email ?? null }));
}

export async function insertResponse(
  db: DbExecutor,
  values: typeof coordinationResponses.$inferInsert,
): Promise<void> {
  // No RETURNING: the BEFORE trigger fills scope columns and external writers may not SELECT back.
  await db.insert(coordinationResponses).values(values);
}

// ── issues ──────────────────────────────────────────────────────────────────

export interface IssueWithActorRow extends CoordinationIssueRow {
  readonly raisedByName: string | null;
}

export async function listIssues(
  db: DbExecutor,
  organizationId: string,
  eventIds: readonly string[],
): Promise<IssueWithActorRow[]> {
  if (eventIds.length === 0) return [];
  const rows = await db
    .select({ issue: coordinationIssues, displayName: profiles.displayName, email: profiles.email })
    .from(coordinationIssues)
    .leftJoin(profiles, eq(profiles.id, coordinationIssues.raisedByUserId))
    .where(
      and(eq(coordinationIssues.organizationId, organizationId), inArray(coordinationIssues.eventId, [...eventIds])),
    )
    .orderBy(desc(coordinationIssues.createdAt), desc(coordinationIssues.id));
  return rows.map((row) => ({ ...row.issue, raisedByName: row.displayName ?? row.email ?? null }));
}

export async function findIssue(
  db: DbExecutor,
  organizationId: string,
  issueId: string,
): Promise<CoordinationIssueRow | null> {
  const [row] = await db
    .select()
    .from(coordinationIssues)
    .where(and(eq(coordinationIssues.id, issueId), eq(coordinationIssues.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertIssue(db: DbExecutor, values: typeof coordinationIssues.$inferInsert): Promise<void> {
  await db.insert(coordinationIssues).values(values);
}

export async function resolveIssue(
  db: DbExecutor,
  organizationId: string,
  issueId: string,
  patch: { status: 'task_created' | 'dismissed'; taskId?: string | null; resolvedByUserId: string },
): Promise<void> {
  const now = new Date();
  await db
    .update(coordinationIssues)
    .set({
      status: patch.status,
      taskId: patch.taskId ?? null,
      resolvedByUserId: patch.resolvedByUserId,
      resolvedAt: now,
      updatedAt: now,
    })
    .where(and(eq(coordinationIssues.id, issueId), eq(coordinationIssues.organizationId, organizationId)));
}

// ── reschedules / overrides / outcomes ─────────────────────────────────────

export async function insertReschedule(
  db: DbExecutor,
  values: typeof coordinationReschedules.$inferInsert,
): Promise<void> {
  await db.insert(coordinationReschedules).values(values);
}

export async function listReschedules(db: DbExecutor, organizationId: string, eventId: string) {
  const rows = await db
    .select({ row: coordinationReschedules, displayName: profiles.displayName, email: profiles.email })
    .from(coordinationReschedules)
    .leftJoin(profiles, eq(profiles.id, coordinationReschedules.actorUserId))
    .where(
      and(eq(coordinationReschedules.organizationId, organizationId), eq(coordinationReschedules.eventId, eventId)),
    )
    .orderBy(desc(coordinationReschedules.createdAt));
  return rows.map((row) => ({ ...row.row, actorName: row.displayName ?? row.email ?? null }));
}

export async function insertOverride(
  db: DbExecutor,
  values: typeof coordinationReadinessOverrides.$inferInsert,
): Promise<void> {
  await db.insert(coordinationReadinessOverrides).values(values);
}

export async function listOverrides(db: DbExecutor, organizationId: string, eventId: string) {
  const rows = await db
    .select({ row: coordinationReadinessOverrides, displayName: profiles.displayName, email: profiles.email })
    .from(coordinationReadinessOverrides)
    .leftJoin(profiles, eq(profiles.id, coordinationReadinessOverrides.actorUserId))
    .where(
      and(
        eq(coordinationReadinessOverrides.organizationId, organizationId),
        eq(coordinationReadinessOverrides.eventId, eventId),
      ),
    )
    .orderBy(desc(coordinationReadinessOverrides.createdAt), desc(coordinationReadinessOverrides.id));
  return rows.map((row) => ({ ...row.row, actorName: row.displayName ?? row.email ?? null }));
}

/** Latest override decision per event (one round trip for a page of events). */
export async function latestOverrideDecisions(
  db: DbExecutor,
  organizationId: string,
  eventIds: readonly string[],
): Promise<Map<string, CoordinationOverrideDecision>> {
  const result = new Map<string, CoordinationOverrideDecision>();
  if (eventIds.length === 0) return result;
  const rows = await db
    .selectDistinctOn([coordinationReadinessOverrides.eventId], {
      eventId: coordinationReadinessOverrides.eventId,
      decision: coordinationReadinessOverrides.decision,
    })
    .from(coordinationReadinessOverrides)
    .where(
      and(
        eq(coordinationReadinessOverrides.organizationId, organizationId),
        inArray(coordinationReadinessOverrides.eventId, [...eventIds]),
      ),
    )
    .orderBy(
      coordinationReadinessOverrides.eventId,
      desc(coordinationReadinessOverrides.createdAt),
      desc(coordinationReadinessOverrides.id),
    );
  for (const row of rows) result.set(row.eventId, row.decision);
  return result;
}

export async function insertOutcome(
  db: DbExecutor,
  values: typeof coordinationOutcomes.$inferInsert,
): Promise<void> {
  await db.insert(coordinationOutcomes).values(values);
}

export async function listOutcomes(db: DbExecutor, organizationId: string, eventId: string) {
  const rows = await db
    .select({ row: coordinationOutcomes, displayName: profiles.displayName, email: profiles.email })
    .from(coordinationOutcomes)
    .leftJoin(profiles, eq(profiles.id, coordinationOutcomes.actorUserId))
    .where(and(eq(coordinationOutcomes.organizationId, organizationId), eq(coordinationOutcomes.eventId, eventId)))
    .orderBy(desc(coordinationOutcomes.createdAt));
  return rows.map((row) => ({ ...row.row, actorName: row.displayName ?? row.email ?? null }));
}

// ── documents ───────────────────────────────────────────────────────────────

export async function listEventDocuments(db: DbExecutor, organizationId: string, eventId: string) {
  return db
    .select()
    .from(coordinationEventDocuments)
    .where(
      and(
        eq(coordinationEventDocuments.organizationId, organizationId),
        eq(coordinationEventDocuments.eventId, eventId),
      ),
    )
    .orderBy(asc(coordinationEventDocuments.createdAt));
}

export async function insertEventDocuments(
  db: DbExecutor,
  values: readonly (typeof coordinationEventDocuments.$inferInsert)[],
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(coordinationEventDocuments).values([...values]).onConflictDoNothing();
}

export async function deleteEventDocument(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
  linkId: string,
): Promise<boolean> {
  const rows = await db
    .delete(coordinationEventDocuments)
    .where(
      and(
        eq(coordinationEventDocuments.id, linkId),
        eq(coordinationEventDocuments.organizationId, organizationId),
        eq(coordinationEventDocuments.eventId, eventId),
      ),
    )
    .returning({ id: coordinationEventDocuments.id });
  return rows.length > 0;
}

/** Documents linked to the project (internal picker); only rows the caller's RLS lets through. */
export async function listProjectDocuments(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  limit = 200,
): Promise<{ id: string; title: string }[]> {
  const rows = await db
    .select({ id: documents.id, title: documents.originalFilename })
    .from(documentLinks)
    .innerJoin(
      documents,
      and(eq(documents.id, documentLinks.documentId), eq(documents.organizationId, documentLinks.organizationId)),
    )
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documentLinks.ownerType, 'project'),
        eq(documentLinks.ownerId, projectId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(limit);
  return rows;
}

// ── SECURITY DEFINER helpers (0161) ─────────────────────────────────────────

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function readinessFactsJson(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<unknown> {
  const result = await db.execute(
    sql`select app.coordination_readiness_facts(${organizationId}::uuid, ${eventId}::uuid) as facts`,
  );
  const [row] = rowsOf<{ facts: unknown }>(result);
  const facts = row?.facts ?? null;
  return typeof facts === 'string' ? JSON.parse(facts) : facts;
}

export async function eventTimeZone(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<string | null> {
  const result = await db.execute(
    sql`select app.coordination_event_time_zone(${organizationId}::uuid, ${eventId}::uuid) as tz`,
  );
  const [row] = rowsOf<{ tz: string | null }>(result);
  return row?.tz ?? null;
}

export interface ProjectContractorOption {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly agreementId: string;
  readonly agreementTitle: string;
}

export async function listProjectContractors(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectContractorOption[]> {
  const result = await db.execute(
    sql`select vendor_id, vendor_name, agreement_id, agreement_title
        from app.coordination_project_contractors(${organizationId}::uuid, ${projectId}::uuid)`,
  );
  return rowsOf<{ vendor_id: string; vendor_name: string; agreement_id: string; agreement_title: string }>(
    result,
  ).map((row) => ({
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    agreementId: row.agreement_id,
    agreementTitle: row.agreement_title,
  }));
}
