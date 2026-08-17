import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { toStoredCalendarDate } from '../domain/aggregate';
import type { CalendarNativeEvent } from '../domain/types';
import {
  findNativeCalendarEvent,
  insertNativeCalendarEvent,
  updateNativeCalendarEvent,
} from '../data/calendar.repository';
import {
  calendarEventIdSchema,
  createCalendarEventSchema,
  updateCalendarEventSchema,
  type CreateCalendarEventInput,
  type UpdateCalendarEventInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export async function createCalendarEvent(
  context: OrgContext,
  raw: CreateCalendarEventInput,
): Promise<CalendarNativeEvent> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  const input = parseOrThrow(createCalendarEventSchema.safeParse(raw));
  const eventDate = toStoredCalendarDate(input.eventDate);
  if (!eventDate) {
    throw new ValidationError([{ path: 'eventDate', message: 'A real date is required' }]);
  }
  const created = await insertNativeCalendarEvent(context.db, {
    organizationId: context.organizationId,
    title: input.title,
    notes: input.notes ?? null,
    eventKind: input.eventKind,
    eventDate,
    allDay: input.allDay ?? true,
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
    employeeId: input.employeeId ?? null,
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_CREATED,
    entityType: 'calendar_event',
    entityId: created.id,
    after: { title: created.title, eventDate: created.eventDate, eventKind: created.eventKind },
  });
  return created;
}

export async function updateCalendarEvent(
  context: OrgContext,
  raw: UpdateCalendarEventInput,
): Promise<CalendarNativeEvent> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  const input = parseOrThrow(updateCalendarEventSchema.safeParse(raw));
  const existing = await findNativeCalendarEvent(context.db, context.organizationId, input.eventId);
  if (!existing) throw new NotFoundError('Calendar event');
  const eventDate = input.eventDate ? toStoredCalendarDate(input.eventDate) : existing.eventDate;
  if (!eventDate) {
    throw new ValidationError([{ path: 'eventDate', message: 'A real date is required' }]);
  }
  const updated = await updateNativeCalendarEvent(context.db, context.organizationId, existing.id, {
    title: input.title ?? existing.title,
    notes: input.notes === undefined ? existing.notes : input.notes,
    eventKind: input.eventKind ?? existing.eventKind,
    eventDate,
    allDay: input.allDay ?? existing.allDay,
    projectId: input.projectId === undefined ? existing.projectId : input.projectId,
    clientId: input.clientId === undefined ? existing.clientId : input.clientId,
    employeeId: input.employeeId === undefined ? existing.employeeId : input.employeeId,
  });
  if (!updated) throw new NotFoundError('Calendar event');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_UPDATED,
    entityType: 'calendar_event',
    entityId: updated.id,
    after: { title: updated.title, eventDate: updated.eventDate },
  });
  return updated;
}

export async function cancelCalendarEvent(
  context: OrgContext,
  eventId: string,
): Promise<CalendarNativeEvent> {
  assertPermission(context, PERMISSIONS.SCHEDULING_MANAGE);
  parseOrThrow(calendarEventIdSchema.safeParse({ eventId }));
  const existing = await findNativeCalendarEvent(context.db, context.organizationId, eventId);
  if (!existing) throw new NotFoundError('Calendar event');
  const updated = await updateNativeCalendarEvent(context.db, context.organizationId, existing.id, {
    archivedAt: new Date(),
  });
  if (!updated) throw new NotFoundError('Calendar event');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CALENDAR_EVENT_CANCELLED,
    entityType: 'calendar_event',
    entityId: updated.id,
    after: { archivedAt: updated.archivedAt },
  });
  return updated;
}
