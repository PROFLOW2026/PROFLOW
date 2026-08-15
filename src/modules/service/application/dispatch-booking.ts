import type { OrgContext } from '@/shared/auth/context';
import { resolvePlannedHours } from '@/modules/scheduling/domain/capacity';
import { assertBookingSlotAllowed } from '@/modules/scheduling/application/conflicts';
import { assertEmployeeInOrg } from '@/modules/scheduling/application/assert-refs';
import {
  findActiveWorkOrderBooking,
  insertBooking,
  updateBookingById,
} from '@/modules/scheduling/lookups';
import { resolveDispatchBookingUpsert } from '../domain/dispatch-booking';

export async function upsertWorkOrderDispatchBooking(
  context: OrgContext,
  input: {
    readonly workOrderId: string;
    readonly assigneeEmployeeId: string | null;
    readonly scheduledStartAt: Date | null;
    readonly scheduledEndAt: Date | null;
    readonly confirmConflict?: boolean;
  },
): Promise<{ readonly overlappingBookingIds: readonly string[] }> {
  const existing = await findActiveWorkOrderBooking(
    context.db,
    context.organizationId,
    input.workOrderId,
  );
  const plan = resolveDispatchBookingUpsert({
    existingBookingId: existing?.id ?? null,
    assigneeEmployeeId: input.assigneeEmployeeId,
    scheduledStartAt: input.scheduledStartAt,
    scheduledEndAt: input.scheduledEndAt,
  });

  if (plan.action === 'skip') {
    return { overlappingBookingIds: [] };
  }

  if (plan.action === 'cancel') {
    await updateBookingById(context.db, context.organizationId, plan.bookingId, {
      status: 'cancelled',
    });
    return { overlappingBookingIds: [] };
  }

  await assertEmployeeInOrg(context, plan.employeeId);
  const { overlappingBookings } = await assertBookingSlotAllowed(context, {
    employeeId: plan.employeeId,
    startAt: plan.startAt,
    endAt: plan.endAt,
    confirmConflict: input.confirmConflict,
    excludeBookingId: plan.action === 'update' ? plan.bookingId : undefined,
  });

  const plannedHours = resolvePlannedHours(plan.startAt, plan.endAt, null);

  if (plan.action === 'insert') {
    await insertBooking(context.db, {
      organizationId: context.organizationId,
      employeeId: plan.employeeId,
      projectId: input.workOrderId,
      workOrderId: input.workOrderId,
      startAt: plan.startAt,
      endAt: plan.endAt,
      plannedHours,
      source: 'work_order',
      status: 'planned',
    });
  } else {
    await updateBookingById(context.db, context.organizationId, plan.bookingId, {
      employeeId: plan.employeeId,
      projectId: input.workOrderId,
      workOrderId: input.workOrderId,
      startAt: plan.startAt,
      endAt: plan.endAt,
      plannedHours,
      status: 'planned',
    });
  }

  return { overlappingBookingIds: overlappingBookings.map((row) => row.id) };
}
