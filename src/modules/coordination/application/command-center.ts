import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { coordinationEvents, projects } from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';
import { addDays } from '@/shared/dates';
import { listParticipants, listResponses, type CoordinationParticipantRow } from '../data/coordination.repository';
import { eventReadinessFacts } from '../domain/assemble';
import { computeEventReadiness, type EventReadiness } from '../domain/readiness';

const OPEN_STATUSES = ['scheduled', 'postponed'] as const;
const SCAN = 200;

type ListedEvent = typeof coordinationEvents.$inferSelect & { readonly projectName: string };

function calendarDay(instant: Date | string, timeZone: string): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function utcStart(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function partyLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

async function readinessFor(
  context: OrgContext,
  events: readonly ListedEvent[],
): Promise<Map<string, { readiness: EventReadiness; participants: CoordinationParticipantRow[] }>> {
  const ids = events.map((event) => event.id);
  const [participants, responses] = await Promise.all([
    listParticipants(context.db, context.organizationId, ids),
    listResponses(context.db, context.organizationId, ids),
  ]);
  const result = new Map<string, { readiness: EventReadiness; participants: CoordinationParticipantRow[] }>();
  for (const event of events) {
    const own = participants.filter((participant) => participant.eventId === event.id);
    const facts = eventReadinessFacts({
      requiredAcknowledgements: event.requiredAcknowledgements,
      readinessEpochAt: event.readinessEpochAt,
      override: null,
      participants: own,
      responses: responses.filter((response) => response.eventId === event.id),
    });
    result.set(event.id, { readiness: computeEventReadiness(facts), participants: own });
  }
  return result;
}

function vendorNames(
  participants: readonly CoordinationParticipantRow[],
  participantIds: readonly string[],
): string | null {
  const wanted = new Set(participantIds);
  const names = participants
    .filter((participant) => wanted.has(participant.id))
    .map((participant) => partyLabel(participant.partyName))
    .filter((name): name is string => Boolean(name));
  const unique = [...new Set(names)];
  return unique.length > 0 ? unique.slice(0, 3).join(', ') : null;
}

async function listOpenEvents(
  context: OrgContext,
  projectIds: readonly string[],
  window: { readonly from?: Date; readonly to?: Date; readonly deadlineBefore?: Date },
): Promise<ListedEvent[]> {
  const conditions = [
    eq(coordinationEvents.organizationId, context.organizationId),
    inArray(coordinationEvents.projectId, [...projectIds]),
    inArray(coordinationEvents.status, [...OPEN_STATUSES]),
  ];
  // postgres-js stores timestamptz parameters as text. A Date object is rejected at bind time.
  if (window.from) {
    conditions.push(sql`${coordinationEvents.startsAt} >= ${window.from.toISOString()}::timestamptz`);
  }
  if (window.to) {
    conditions.push(sql`${coordinationEvents.startsAt} < ${window.to.toISOString()}::timestamptz`);
  }
  if (window.deadlineBefore) {
    conditions.push(
      sql`coalesce(${coordinationEvents.preparationDeadline}, ${coordinationEvents.startsAt}) < ${window.deadlineBefore.toISOString()}::timestamptz`,
    );
  }
  const rows = await context.db
    .select({ event: coordinationEvents, projectName: projects.name })
    .from(coordinationEvents)
    .innerJoin(
      projects,
      and(eq(projects.id, coordinationEvents.projectId), eq(projects.organizationId, coordinationEvents.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(asc(sql`coalesce(${coordinationEvents.preparationDeadline}, ${coordinationEvents.startsAt})`))
    .limit(SCAN);
  return rows.map((row) => ({ ...row.event, projectName: row.projectName }));
}

/** Upcoming open events whose required parties answered BLOCKED or NOT_READY. */
export async function queryCoordinationBlocked(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const zone = context.organization.timezone;
  const lastDay = addDays(input.today, 14);
  const events = await listOpenEvents(context, input.projectIds, {
    from: utcStart(addDays(input.today, -1)),
    to: utcStart(addDays(input.today, 16)),
  });
  const upcoming = events.filter((event) => {
    const day = calendarDay(event.startsAt, zone);
    return day >= input.today && day <= lastDay;
  });
  const readiness = await readinessFor(context, upcoming);
  const rows: DgCommandCenterRow[] = [];
  for (const event of upcoming) {
    if (rows.length >= input.limit) break;
    const computed = readiness.get(event.id);
    if (!computed) continue;
    const blocked = computed.readiness.parties.filter(
      (party) => party.isRequired && (party.state === 'blocked' || party.state === 'not_ready'),
    );
    if (blocked.length === 0) continue;
    rows.push({
      id: event.id,
      projectId: event.projectId,
      projectName: event.projectName,
      vendorName: vendorNames(
        computed.participants,
        blocked.map((party) => party.participantId),
      ),
      reference: event.title,
      dueDate: calendarDay(event.startsAt, zone),
    });
  }
  return rows;
}

/**
 * Invitations past their preparation deadline (or start, when no deadline is set) where a required
 * party has not answered, or still owes a required acknowledgement.
 */
export async function queryCoordinationAcknowledgementOverdue(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const zone = context.organization.timezone;
  const events = await listOpenEvents(context, input.projectIds, {
    deadlineBefore: utcStart(addDays(input.today, 2)),
  });
  const overdue = events.filter((event) => {
    const deadline = calendarDay(event.preparationDeadline ?? event.startsAt, zone);
    return deadline < input.today;
  });
  const readiness = await readinessFor(context, overdue);
  const rows: DgCommandCenterRow[] = [];
  for (const event of overdue) {
    if (rows.length >= input.limit) break;
    const computed = readiness.get(event.id);
    if (!computed) continue;
    const pending = computed.readiness.parties.filter(
      (party) => party.isRequired && (party.state === 'waiting' || party.missingAcknowledgementKeys.length > 0),
    );
    if (pending.length === 0) continue;
    rows.push({
      id: event.id,
      projectId: event.projectId,
      projectName: event.projectName,
      vendorName: vendorNames(
        computed.participants,
        pending.map((party) => party.participantId),
      ),
      reference: event.title,
      dueDate: calendarDay(event.preparationDeadline ?? event.startsAt, zone),
      kind: 'coordination_event',
    });
  }
  return rows;
}
