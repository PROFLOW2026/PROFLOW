/** Unified calendar items. Native meetings live in `calendar_events`; other kinds are projections. */

export const NATIVE_CALENDAR_EVENT_KINDS = ['meeting', 'site_visit', 'other'] as const;
export type NativeCalendarEventKind = (typeof NATIVE_CALENDAR_EVENT_KINDS)[number];

export const CALENDAR_ITEM_KINDS = [
  ...NATIVE_CALENDAR_EVENT_KINDS,
  'work_order',
  'inspection',
  'milestone',
  'task',
  'assignment',
  'maintenance',
  'warranty',
  'compliance',
  'follow_up',
] as const;
export type CalendarItemKind = (typeof CALENDAR_ITEM_KINDS)[number];

export const CALENDAR_ITEM_SOURCES = ['native', 'existing'] as const;
export type CalendarItemSource = (typeof CALENDAR_ITEM_SOURCES)[number];

export const CALENDAR_PROVIDER_STATUSES = ['unconfigured', 'error'] as const;
export type CalendarProviderStatus = (typeof CALENDAR_PROVIDER_STATUSES)[number];

export const EXTERNAL_CALENDAR_PROVIDERS = ['google', 'microsoft'] as const;
export type ExternalCalendarProviderKey = (typeof EXTERNAL_CALENDAR_PROVIDERS)[number];

export interface CalendarNativeEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly title: string;
  readonly notes: string | null;
  readonly eventKind: NativeCalendarEventKind;
  readonly eventDate: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly allDay: boolean;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly employeeId: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: string | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CalendarItem {
  readonly id: string;
  readonly source: CalendarItemSource;
  readonly kind: CalendarItemKind;
  readonly title: string;
  readonly date: string;
  readonly allDay: boolean;
  readonly href: string | null;
  readonly projectId: string | null;
  readonly notes: string | null;
}

export interface DatedCalendarSource {
  readonly id: string;
  readonly kind: CalendarItemKind;
  readonly source: CalendarItemSource;
  readonly title: string;
  /** Only a real stored date. Null/invalid is dropped — never replaced with today. */
  readonly date: string | Date | null | undefined;
  readonly href?: string | null;
  readonly projectId?: string | null;
  readonly notes?: string | null;
  readonly allDay?: boolean;
}

export interface CalendarProviderConnection {
  readonly providerKey: ExternalCalendarProviderKey;
  readonly status: CalendarProviderStatus;
  readonly lastError: string | null;
}

export const CALENDAR_VIEWS = ['month', 'agenda'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
