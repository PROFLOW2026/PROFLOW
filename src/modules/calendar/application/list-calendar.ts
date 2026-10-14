import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { aggregateCalendarItems } from '../domain/aggregate';
import type {
  CalendarItem,
  CalendarProviderConnection,
  CalendarView,
} from '../domain/types';
import { EXTERNAL_CALENDAR_PROVIDERS } from '../domain/types';
import {
  listCalendarProviderConnections,
  listNativeCalendarEvents,
} from '../data/calendar.repository';
import type { CalendarSourceAccess } from '../domain/source-access';
import { listExistingDatedSources } from '../data/source-dates.repository';
import { getModuleVisibility } from '@/modules/tenancy/application/read-module-visibility';
import { hasPermission } from '@/shared/permissions/assert';
import { listCalendarSchema, type ListCalendarInput } from '../validation/schemas';

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

export interface CalendarBoard {
  readonly from: string;
  readonly to: string;
  readonly view: CalendarView;
  readonly items: readonly CalendarItem[];
  readonly providers: readonly CalendarProviderConnection[];
}

export async function listCalendar(
  context: OrgContext,
  raw: ListCalendarInput,
): Promise<CalendarBoard> {
  assertPermission(context, PERMISSIONS.SCHEDULING_READ);
  const input = parseOrThrow(listCalendarSchema.safeParse(raw));
  const range = { from: input.from, to: input.to };

  let native: Awaited<ReturnType<typeof listNativeCalendarEvents>> = [];
  let existing: Awaited<ReturnType<typeof listExistingDatedSources>> = [];
  let providers: CalendarProviderConnection[] = EXTERNAL_CALENDAR_PROVIDERS.map((providerKey) => ({
    providerKey,
    status: 'unconfigured',
    lastError: null,
  }));

  try {
    native = await listNativeCalendarEvents(context.db, context.organizationId, range);
  } catch {
    native = [];
  }
  let sourceAccess: CalendarSourceAccess | null = null;
  try {
    sourceAccess = {
      hasPermission: (permission) => hasPermission(context, permission),
      modules: await getModuleVisibility(context),
    };
  } catch {
    // Degraded: only native calendar events; no cross-module dated sources.
  }
  if (sourceAccess) {
    try {
      existing = await listExistingDatedSources(
        context.db,
        context.organizationId,
        range,
        sourceAccess,
      );
    } catch {
      existing = [];
    }
  }
  try {
    providers = await listCalendarProviderConnections(context.db, context.organizationId);
  } catch {
    providers = EXTERNAL_CALENDAR_PROVIDERS.map((providerKey) => ({
      providerKey,
      status: 'unconfigured' as const,
      lastError: null,
    }));
  }

  const items = aggregateCalendarItems([
    ...native.map((event) => ({
      id: `native:${event.id}`,
      kind: event.eventKind,
      source: 'native' as const,
      title: event.title,
      date: event.eventDate,
      href: `/calendar?event=${event.id}`,
      projectId: event.projectId,
      notes: event.notes,
      allDay: event.allDay,
    })),
    ...existing,
  ]);

  return {
    from: input.from,
    to: input.to,
    view: input.view ?? 'month',
    items,
    providers,
  };
}
