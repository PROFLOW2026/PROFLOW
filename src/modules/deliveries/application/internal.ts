import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { internalActor, type Actor } from '@/shared/actor';
import { todayInTimeZone } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { findAgreementScope } from '@/modules/contractor-compliance';
import {
  PROJECT_CAPABILITIES as C,
  assertAnyProjectCapability,
  assertProjectCapability,
  hasProjectCapability,
} from '@/modules/project-team';
import {
  assertArrivalDate,
  assertDeliveryTransition,
  compareDeliveriesForBoard,
  isRescheduledLater,
  withDeliveryStatus,
} from '../domain/rules';
import {
  DELIVERY_ITEM_ENTITY,
  type DeliveryItemRecord,
  type DeliveryReportRecord,
  type DeliveryState,
  type DeliveryWithStatus,
} from '../domain/types';
import {
  findDeliveryItem,
  insertDeliveryItem,
  insertDeliveryReport,
  listDeliveryItems,
  listDeliveryReports,
  locationOnProject,
  updateDeliveryItemRow,
  vendorExists,
  vendorNames,
  workPackageOnProject,
  type DeliveryListFilter,
} from '../data/deliveries.repository';
import {
  createDeliverySchema,
  updateDeliverySchema,
  type CreateDeliveryInput,
  type UpdateDeliveryInput,
} from '../validation/schemas';

const WRITE_CAPABILITIES = [C.CONTRACTOR_COORDINATE, C.SCHEDULE_MANAGE] as const;

export function parseInput<T>(
  result: { success: true; data: T } | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    );
  }
  return result.data;
}

function today(context: OrgContext): string {
  return todayInTimeZone(context.organization.timezone) as string;
}

function requireOnProject(item: DeliveryItemRecord | null, projectId: string): DeliveryItemRecord {
  if (!item || item.projectId !== projectId) throw new NotFoundError('Delivery item');
  return item;
}

/** Events for a state/date change (shared by internal updates, contractor reports and the scan). */
export async function emitDeliveryChangeEvents(
  db: DbExecutor,
  input: {
    readonly before: DeliveryItemRecord;
    readonly after: { state: DeliveryState; expectedDate: string | null; actualDate: string | null };
    readonly actor: Actor;
  },
): Promise<{ delivered: boolean; rescheduled: boolean }> {
  const { before, after, actor } = input;
  const base = {
    organizationId: before.organizationId,
    projectId: before.projectId,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: before.id,
    actor,
  };
  const delivered = after.state === 'delivered' && before.state !== 'delivered';
  if (delivered) {
    await emitDomainEvent(db, {
      ...base,
      type: DOMAIN_EVENTS.DELIVERY_ITEM_DELIVERED,
      payload: {
        vendorId: before.vendorId,
        isCritical: before.isCritical,
        expectedDate: after.expectedDate,
        actualDate: after.actualDate,
        late: Boolean(after.expectedDate && after.actualDate && after.actualDate > after.expectedDate),
      },
    });
  }
  const rescheduled = isRescheduledLater(before.expectedDate, after.expectedDate);
  if (rescheduled) {
    await emitDomainEvent(db, {
      ...base,
      type: DOMAIN_EVENTS.DELIVERY_ITEM_DELAYED,
      payload: {
        reason: 'rescheduled',
        vendorId: before.vendorId,
        isCritical: before.isCritical,
        previousExpectedDate: before.expectedDate,
        expectedDate: after.expectedDate,
      },
    });
  }
  return { delivered, rescheduled };
}

export interface DeliveryBoardRow extends DeliveryWithStatus {
  readonly vendorName: string | null;
  readonly supplierVendorName: string | null;
}

export async function listProjectDeliveries(
  context: OrgContext,
  filter: DeliveryListFilter,
): Promise<{ readonly items: readonly DeliveryBoardRow[]; readonly canManage: boolean; readonly today: string }> {
  await assertProjectCapability(context, filter.projectId, C.PROJECT_VIEW);
  const now = today(context);
  const [items, coordinate, schedule] = await Promise.all([
    listDeliveryItems(context.db, context.organizationId, filter),
    hasProjectCapability(context, filter.projectId, C.CONTRACTOR_COORDINATE),
    hasProjectCapability(context, filter.projectId, C.SCHEDULE_MANAGE),
  ]);
  const names = await vendorNames(context.db, context.organizationId, [
    ...new Set(items.flatMap((item) => [item.vendorId, item.supplierVendorId]).filter((id): id is string => Boolean(id))),
  ]);
  const rows = items
    .map((item) => ({
      ...withDeliveryStatus(item, now),
      vendorName: item.vendorId ? (names.get(item.vendorId) ?? null) : null,
      supplierVendorName: item.supplierVendorId ? (names.get(item.supplierVendorId) ?? null) : null,
    }))
    .sort(compareDeliveriesForBoard);
  return { items: rows, canManage: coordinate || schedule, today: now };
}

export async function getProjectDelivery(
  context: OrgContext,
  input: { readonly projectId: string; readonly deliveryItemId: string },
): Promise<DeliveryBoardRow & { readonly reports: readonly DeliveryReportRecord[] }> {
  await assertProjectCapability(context, input.projectId, C.PROJECT_VIEW);
  const item = requireOnProject(
    await findDeliveryItem(context.db, context.organizationId, input.deliveryItemId),
    input.projectId,
  );
  const [reports, names] = await Promise.all([
    listDeliveryReports(context.db, context.organizationId, item.id),
    vendorNames(
      context.db,
      context.organizationId,
      [item.vendorId, item.supplierVendorId].filter((id): id is string => Boolean(id)),
    ),
  ]);
  return {
    ...withDeliveryStatus(item, today(context)),
    vendorName: item.vendorId ? (names.get(item.vendorId) ?? null) : null,
    supplierVendorName: item.supplierVendorId ? (names.get(item.supplierVendorId) ?? null) : null,
    reports,
  };
}

async function assertReferences(
  context: OrgContext,
  projectId: string,
  refs: {
    vendorId?: string | null;
    agreementId?: string | null;
    supplierVendorId?: string | null;
    locationId?: string | null;
    workPackageId?: string | null;
  },
): Promise<void> {
  const { db, organizationId } = context;
  if (refs.agreementId) {
    const agreement = await findAgreementScope(db, organizationId, refs.agreementId);
    if (!agreement || agreement.projectId !== projectId || (refs.vendorId && agreement.vendorId !== refs.vendorId)) {
      throw new NotFoundError('Subcontract agreement');
    }
  }
  if (refs.vendorId && !(await vendorExists(db, organizationId, refs.vendorId))) throw new NotFoundError('Contractor');
  if (refs.supplierVendorId && !(await vendorExists(db, organizationId, refs.supplierVendorId))) {
    throw new NotFoundError('Supplier');
  }
  if (refs.locationId && !(await locationOnProject(db, organizationId, projectId, refs.locationId))) {
    throw new NotFoundError('Location');
  }
  if (refs.workPackageId && !(await workPackageOnProject(db, organizationId, projectId, refs.workPackageId))) {
    throw new NotFoundError('Work package');
  }
}

export async function createProjectDelivery(
  context: OrgContext,
  raw: CreateDeliveryInput,
): Promise<DeliveryItemRecord> {
  const input = parseInput(createDeliverySchema.safeParse(raw));
  await assertAnyProjectCapability(context, input.projectId, WRITE_CAPABILITIES);
  let vendorId = input.vendorId;
  if (input.agreementId && !vendorId) {
    vendorId = (await findAgreementScope(context.db, context.organizationId, input.agreementId))?.vendorId ?? null;
  }
  await assertReferences(context, input.projectId, { ...input, vendorId });
  assertArrivalDate(input.state, input.actualDate);

  const id = randomUUID();
  await insertDeliveryItem(context.db, {
    id,
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorId,
    subcontractAgreementId: input.agreementId,
    itemName: input.itemName,
    description: input.description,
    itemKind: input.itemKind,
    isCritical: input.isCritical,
    supplierVendorId: input.supplierVendorId,
    supplierName: input.supplierName,
    quantity: input.quantity,
    unit: input.unit,
    orderDate: input.orderDate,
    originalExpectedDate: input.expectedDate,
    expectedDate: input.expectedDate,
    actualDate: input.actualDate,
    state: input.state,
    locationId: input.locationId,
    workPackageId: input.workPackageId,
    purchaseOrderId: input.purchaseOrderId,
    notes: input.notes,
    contractorVisible: input.contractorVisible,
    createdActorType: 'internal',
    createdByUserId: context.userId,
  });
  if (input.state === 'delivered') {
    const created = (await findDeliveryItem(context.db, context.organizationId, id))!;
    await emitDeliveryChangeEvents(context.db, {
      before: { ...created, state: 'planned' },
      after: { state: 'delivered', expectedDate: input.expectedDate, actualDate: input.actualDate },
      actor: internalActor(context.userId),
    });
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DELIVERY_ITEM_CREATED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: id,
    after: { itemName: input.itemName, vendorId, state: input.state, expectedDate: input.expectedDate },
  });
  return (await findDeliveryItem(context.db, context.organizationId, id))!;
}

export async function updateProjectDelivery(
  context: OrgContext,
  raw: UpdateDeliveryInput,
): Promise<DeliveryItemRecord> {
  const input = parseInput(updateDeliverySchema.safeParse(raw));
  await assertAnyProjectCapability(context, input.projectId, WRITE_CAPABILITIES);
  const before = requireOnProject(
    await findDeliveryItem(context.db, context.organizationId, input.deliveryItemId),
    input.projectId,
  );
  const has = (key: keyof UpdateDeliveryInput) => Object.prototype.hasOwnProperty.call(raw, key);
  await assertReferences(context, input.projectId, {
    locationId: has('locationId') ? input.locationId : null,
    workPackageId: has('workPackageId') ? input.workPackageId : null,
  });

  const state = input.state ?? before.state;
  const expectedDate = has('expectedDate') ? input.expectedDate : before.expectedDate;
  const actualDate = has('actualDate') ? input.actualDate : before.actualDate;
  assertDeliveryTransition(before.state, state, 'internal');
  assertArrivalDate(state, actualDate);

  await updateDeliveryItemRow(context.db, context.organizationId, before.id, {
    ...(input.itemName !== undefined ? { itemName: input.itemName } : {}),
    ...(has('description') ? { description: input.description } : {}),
    ...(input.isCritical !== undefined ? { isCritical: input.isCritical } : {}),
    ...(has('supplierName') ? { supplierName: input.supplierName } : {}),
    ...(has('quantity') ? { quantity: input.quantity } : {}),
    ...(has('unit') ? { unit: input.unit } : {}),
    ...(has('orderDate') ? { orderDate: input.orderDate } : {}),
    ...(has('locationId') ? { locationId: input.locationId } : {}),
    ...(has('workPackageId') ? { workPackageId: input.workPackageId } : {}),
    ...(has('notes') ? { notes: input.notes } : {}),
    ...(input.contractorVisible !== undefined ? { contractorVisible: input.contractorVisible } : {}),
    ...(input.archived ? { archivedAt: new Date() } : {}),
    state,
    expectedDate,
    actualDate,
    ...(before.originalExpectedDate === null && expectedDate ? { originalExpectedDate: expectedDate } : {}),
  });

  const changedSchedule =
    state !== before.state || expectedDate !== before.expectedDate || actualDate !== before.actualDate;
  if (changedSchedule || input.reportNote) {
    await insertDeliveryReport(context.db, {
      organizationId: context.organizationId,
      projectId: before.projectId,
      deliveryItemId: before.id,
      reportKind: state === 'delivered' && before.state !== 'delivered' ? 'arrived' : 'status_update',
      reportedState: state !== before.state ? state : null,
      newExpectedDate: expectedDate !== before.expectedDate ? expectedDate : null,
      actualDate: actualDate !== before.actualDate ? actualDate : null,
      note: input.reportNote,
      actorType: 'internal',
      actorUserId: context.userId,
    });
  }
  await emitDeliveryChangeEvents(context.db, {
    before,
    after: { state, expectedDate, actualDate },
    actor: internalActor(context.userId),
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.DELIVERY_ITEM_UPDATED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: before.id,
    before: { state: before.state, expectedDate: before.expectedDate, actualDate: before.actualDate },
    after: { state, expectedDate, actualDate, archived: Boolean(input.archived) },
  });
  const after = await findDeliveryItem(context.db, context.organizationId, before.id);
  return after ?? { ...before, state, expectedDate, actualDate };
}
