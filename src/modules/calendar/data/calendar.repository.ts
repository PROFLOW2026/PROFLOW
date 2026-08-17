import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { calendarEvents, organizationIntegrations } from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { toStoredCalendarDate } from '../domain/aggregate';
import type {
  CalendarNativeEvent,
  CalendarProviderConnection,
  CalendarProviderStatus,
  ExternalCalendarProviderKey,
  NativeCalendarEventKind,
} from '../domain/types';
import { EXTERNAL_CALENDAR_PROVIDERS } from '../domain/types';

function mapEvent(row: typeof calendarEvents.$inferSelect): CalendarNativeEvent | null {
  const eventDate = toStoredCalendarDate(row.eventDate);
  if (!eventDate) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    notes: row.notes,
    eventKind: row.eventKind as NativeCalendarEventKind,
    eventDate,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    projectId: row.projectId,
    clientId: row.clientId,
    employeeId: row.employeeId,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listNativeCalendarEvents(
  db: DbExecutor,
  organizationId: string,
  range: { from: string; to: string },
): Promise<CalendarNativeEvent[]> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.organizationId, organizationId),
        isNull(calendarEvents.archivedAt),
        gte(calendarEvents.eventDate, range.from),
        lte(calendarEvents.eventDate, range.to),
      ),
    )
    .orderBy(calendarEvents.eventDate)
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map(mapEvent).filter((row): row is CalendarNativeEvent => row !== null);
}

export async function findNativeCalendarEvent(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
): Promise<CalendarNativeEvent | null> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.organizationId, organizationId)))
    .limit(1);
  return row ? mapEvent(row) : null;
}

export async function insertNativeCalendarEvent(
  db: DbExecutor,
  values: {
    organizationId: string;
    title: string;
    notes: string | null;
    eventKind: NativeCalendarEventKind;
    eventDate: string;
    allDay: boolean;
    projectId: string | null;
    clientId: string | null;
    employeeId: string | null;
    createdByUserId: string | null;
  },
): Promise<CalendarNativeEvent> {
  const [row] = await db
    .insert(calendarEvents)
    .values({
      organizationId: values.organizationId,
      title: values.title,
      notes: values.notes,
      eventKind: values.eventKind,
      eventDate: values.eventDate,
      allDay: values.allDay,
      projectId: values.projectId,
      clientId: values.clientId,
      employeeId: values.employeeId,
      createdByUserId: values.createdByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to insert calendar event');
  const mapped = mapEvent(row);
  if (!mapped) throw new Error('Calendar event missing date');
  return mapped;
}

export async function updateNativeCalendarEvent(
  db: DbExecutor,
  organizationId: string,
  eventId: string,
  patch: Partial<{
    title: string;
    notes: string | null;
    eventKind: NativeCalendarEventKind;
    eventDate: string;
    allDay: boolean;
    projectId: string | null;
    clientId: string | null;
    employeeId: string | null;
    archivedAt: Date | null;
  }>,
): Promise<CalendarNativeEvent | null> {
  const [row] = await db
    .update(calendarEvents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.organizationId, organizationId)))
    .returning();
  return row ? mapEvent(row) : null;
}

export async function listCalendarProviderConnections(
  db: DbExecutor,
  organizationId: string,
): Promise<CalendarProviderConnection[]> {
  const rows = await db
    .select()
    .from(organizationIntegrations)
    .where(
      and(
        eq(organizationIntegrations.organizationId, organizationId),
        eq(organizationIntegrations.integrationKind, 'calendar'),
      ),
    )
    .orderBy(desc(organizationIntegrations.updatedAt));

  const byKey = new Map<string, CalendarProviderConnection>();
  for (const row of rows) {
    const status: CalendarProviderStatus = row.status === 'error' ? 'error' : 'unconfigured';
    byKey.set(row.providerKey, {
      providerKey: row.providerKey as ExternalCalendarProviderKey,
      status,
      lastError: row.lastError,
    });
  }

  return EXTERNAL_CALENDAR_PROVIDERS.map((providerKey) => {
    const existing = byKey.get(providerKey);
    return (
      existing ?? {
        providerKey,
        status: 'unconfigured' as const,
        lastError: null,
      }
    );
  });
}
