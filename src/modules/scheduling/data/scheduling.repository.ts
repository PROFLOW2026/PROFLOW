import { and, asc, eq, gt, isNull, lt, lte, gte, ne } from 'drizzle-orm';
import { employeeUnavailability, resourceBookings } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BookingSource,
  BookingStatus,
  EmployeeUnavailabilityRecord,
  ResourceBookingRecord,
  UnavailabilityKind,
} from '../domain/types';

function mapBooking(row: typeof resourceBookings.$inferSelect): ResourceBookingRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    projectId: row.projectId,
    workOrderId: row.workOrderId,
    startAt: row.startAt,
    endAt: row.endAt,
    plannedHours: row.plannedHours,
    source: row.source as BookingSource,
    status: row.status as BookingStatus,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapUnavailability(
  row: typeof employeeUnavailability.$inferSelect,
): EmployeeUnavailabilityRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    kind: row.kind as UnavailabilityKind,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hoursToDb(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toFixed(6);
}

export async function listBookingsInWindow(
  db: DbExecutor,
  organizationId: string,
  window: { start: Date; endExclusive: Date },
  options: { readonly employeeId?: string; readonly includeCancelled?: boolean } = {},
): Promise<ResourceBookingRecord[]> {
  const filters = [
    eq(resourceBookings.organizationId, organizationId),
    isNull(resourceBookings.archivedAt),
    lt(resourceBookings.startAt, window.endExclusive),
    gt(resourceBookings.endAt, window.start),
  ];
  if (!options.includeCancelled) {
    filters.push(ne(resourceBookings.status, 'cancelled'));
  }
  if (options.employeeId) {
    filters.push(eq(resourceBookings.employeeId, options.employeeId));
  }

  const rows = await db
    .select()
    .from(resourceBookings)
    .where(and(...filters))
    .orderBy(asc(resourceBookings.startAt), asc(resourceBookings.createdAt))
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_EXPORT_CAP, defaultLimit: ORG_LIST_HARD_CAP }));

  return rows.map(mapBooking);
}

export async function listOverlappingBookings(
  db: DbExecutor,
  organizationId: string,
  input: {
    employeeId: string;
    startAt: Date;
    endAt: Date;
    excludeBookingId?: string;
  },
): Promise<ResourceBookingRecord[]> {
  const filters = [
    eq(resourceBookings.organizationId, organizationId),
    eq(resourceBookings.employeeId, input.employeeId),
    isNull(resourceBookings.archivedAt),
    ne(resourceBookings.status, 'cancelled'),
    lt(resourceBookings.startAt, input.endAt),
    gt(resourceBookings.endAt, input.startAt),
  ];
  if (input.excludeBookingId) {
    filters.push(ne(resourceBookings.id, input.excludeBookingId));
  }

  const rows = await db
    .select()
    .from(resourceBookings)
    .where(and(...filters))
    .orderBy(asc(resourceBookings.startAt));

  return rows.map(mapBooking);
}

export async function findBookingById(
  db: DbExecutor,
  organizationId: string,
  bookingId: string,
): Promise<ResourceBookingRecord | null> {
  const [row] = await db
    .select()
    .from(resourceBookings)
    .where(and(eq(resourceBookings.id, bookingId), eq(resourceBookings.organizationId, organizationId)))
    .limit(1);
  return row ? mapBooking(row) : null;
}

export async function insertBooking(
  db: DbExecutor,
  values: {
    organizationId: string;
    employeeId: string;
    projectId?: string | null;
    workOrderId?: string | null;
    startAt: Date;
    endAt: Date;
    plannedHours?: number | null;
    source?: BookingSource;
    status?: BookingStatus;
    notes?: string | null;
  },
): Promise<ResourceBookingRecord> {
  const [row] = await db
    .insert(resourceBookings)
    .values({
      organizationId: values.organizationId,
      employeeId: values.employeeId,
      projectId: values.projectId ?? null,
      workOrderId: values.workOrderId ?? null,
      startAt: values.startAt,
      endAt: values.endAt,
      plannedHours: hoursToDb(values.plannedHours),
      source: values.source ?? 'manual',
      status: values.status ?? 'planned',
      notes: values.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert resource booking');
  return mapBooking(row);
}

export async function updateBookingById(
  db: DbExecutor,
  organizationId: string,
  bookingId: string,
  patch: Partial<{
    employeeId: string;
    projectId: string | null;
    workOrderId: string | null;
    startAt: Date;
    endAt: Date;
    plannedHours: number | null;
    status: BookingStatus;
    notes: string | null;
  }>,
): Promise<ResourceBookingRecord | null> {
  const set: {
    updatedAt: Date;
    employeeId?: string;
    projectId?: string | null;
    workOrderId?: string | null;
    startAt?: Date;
    endAt?: Date;
    plannedHours?: string | null;
    status?: BookingStatus;
    notes?: string | null;
  } = { updatedAt: new Date() };
  if (patch.employeeId !== undefined) set.employeeId = patch.employeeId;
  if (patch.projectId !== undefined) set.projectId = patch.projectId;
  if (patch.workOrderId !== undefined) set.workOrderId = patch.workOrderId;
  if (patch.startAt !== undefined) set.startAt = patch.startAt;
  if (patch.endAt !== undefined) set.endAt = patch.endAt;
  if (patch.plannedHours !== undefined) set.plannedHours = hoursToDb(patch.plannedHours);
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.notes !== undefined) set.notes = patch.notes;

  const [row] = await db
    .update(resourceBookings)
    .set(set)
    .where(and(eq(resourceBookings.id, bookingId), eq(resourceBookings.organizationId, organizationId)))
    .returning();
  return row ? mapBooking(row) : null;
}

export async function listUnavailabilityInWindow(
  db: DbExecutor,
  organizationId: string,
  window: { from: string; to: string },
  options: { readonly employeeId?: string } = {},
): Promise<EmployeeUnavailabilityRecord[]> {
  const filters = [
    eq(employeeUnavailability.organizationId, organizationId),
    isNull(employeeUnavailability.archivedAt),
    lte(employeeUnavailability.startDate, window.to),
    gte(employeeUnavailability.endDate, window.from),
  ];
  if (options.employeeId) {
    filters.push(eq(employeeUnavailability.employeeId, options.employeeId));
  }

  const rows = await db
    .select()
    .from(employeeUnavailability)
    .where(and(...filters))
    .orderBy(asc(employeeUnavailability.startDate), asc(employeeUnavailability.createdAt))
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map(mapUnavailability);
}

export async function listOverlappingUnavailability(
  db: DbExecutor,
  organizationId: string,
  input: { employeeId: string; startDate: string; endDate: string; excludeId?: string },
): Promise<EmployeeUnavailabilityRecord[]> {
  const filters = [
    eq(employeeUnavailability.organizationId, organizationId),
    eq(employeeUnavailability.employeeId, input.employeeId),
    isNull(employeeUnavailability.archivedAt),
    lte(employeeUnavailability.startDate, input.endDate),
    gte(employeeUnavailability.endDate, input.startDate),
  ];
  if (input.excludeId) {
    filters.push(ne(employeeUnavailability.id, input.excludeId));
  }

  const rows = await db
    .select()
    .from(employeeUnavailability)
    .where(and(...filters))
    .orderBy(asc(employeeUnavailability.startDate));

  return rows.map(mapUnavailability);
}

export async function insertUnavailability(
  db: DbExecutor,
  values: {
    organizationId: string;
    employeeId: string;
    startDate: string;
    endDate: string;
    kind?: UnavailabilityKind;
    notes?: string | null;
  },
): Promise<EmployeeUnavailabilityRecord> {
  const [row] = await db
    .insert(employeeUnavailability)
    .values({
      organizationId: values.organizationId,
      employeeId: values.employeeId,
      startDate: values.startDate,
      endDate: values.endDate,
      kind: values.kind ?? 'leave',
      notes: values.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert employee unavailability');
  return mapUnavailability(row);
}
