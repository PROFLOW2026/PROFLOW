import Decimal from 'decimal.js';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, findProjectById, isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertCanReserve,
  availableQuantity,
  normalizeQuantity,
  remainingReservationAfterConsume,
} from '../domain/inventory';
import { findInventoryItemById } from '../data/assets.repository';
import {
  findInventoryReservationById,
  insertInventoryReservation,
  listInventoryReservations,
  lockInventoryItemRow,
  lockInventoryReservationForUpdate,
  sumActiveReservedForItem,
  updateInventoryReservationById,
} from '../data/inventory-advanced.repository';
import {
  releaseInventoryReservationSchema,
  reserveInventorySchema,
  type ReleaseInventoryReservationInput,
  type ReserveInventoryInput,
} from '../validation/schemas';
import type { InventoryReservationRecord } from '../domain/types';

function parseOrThrow<T>(
  parsed:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

async function requireActiveItem(context: OrgContext, inventoryItemId: string) {
  const item = await findInventoryItemById(context.db, context.organizationId, inventoryItemId);
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');
  return item;
}

async function requireWorkTarget(
  context: OrgContext,
  projectId: string | null | undefined,
  workOrderId: string | null | undefined,
): Promise<{ projectId: string | null; workOrderId: string | null }> {
  let resolvedProjectId = projectId ?? null;
  let resolvedWorkOrderId = workOrderId ?? null;

  if (resolvedProjectId) {
    const project = await findProjectById(context.db, context.organizationId, resolvedProjectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
    await assertCanAccessProject(context, resolvedProjectId);
  }

  if (resolvedWorkOrderId) {
    const workOrder = await findProjectById(
      context.db,
      context.organizationId,
      resolvedWorkOrderId,
    );
    if (!workOrder || workOrder.archivedAt) throw new NotFoundError('Work order');
    if (workOrder.workKind !== 'work_order') {
      throw new DomainRuleError('Not a work order', 'assets.errors.notAWorkOrder');
    }
    await assertCanAccessProject(context, resolvedWorkOrderId);
    if (!resolvedProjectId) resolvedProjectId = workOrder.id;
  }

  if (!resolvedProjectId && !resolvedWorkOrderId) {
    throw new DomainRuleError(
      'Reserve for a project and/or work order',
      'assets.errors.reservationTargetRequired',
    );
  }

  return { projectId: resolvedProjectId, workOrderId: resolvedWorkOrderId };
}

export async function listInventoryReservationsForOrg(
  context: OrgContext,
  options: { readonly inventoryItemId?: string; readonly activeOnly?: boolean } = {},
): Promise<InventoryReservationRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const [allowed, rows] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listInventoryReservations(context.db, context.organizationId, {
      inventoryItemId: options.inventoryItemId,
      status: options.activeOnly === false ? undefined : 'active',
    }),
  ]);
  return rows.filter(
    (row) =>
      isAccessibleProjectId(allowed, row.projectId) &&
      isAccessibleProjectId(allowed, row.workOrderId),
  );
}

export async function availableForInventoryItem(
  context: OrgContext,
  inventoryItemId: string,
): Promise<{ quantityOnHand: string; reservedActive: string; available: string }> {
  const item = await requireActiveItem(context, inventoryItemId);
  const reservedActive = await sumActiveReservedForItem(
    context.db,
    context.organizationId,
    inventoryItemId,
  );
  return {
    quantityOnHand: item.quantityOnHand,
    reservedActive,
    available: availableQuantity(item.quantityOnHand, reservedActive),
  };
}

export async function reserveInventory(context: OrgContext, raw: ReserveInventoryInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(reserveInventorySchema.safeParse(raw));
  const quantity = normalizeQuantity(input.quantity);
  const target = await requireWorkTarget(context, input.projectId, input.workOrderId);

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    await lockInventoryItemRow(tx, context.organizationId, input.inventoryItemId);
    const item = await requireActiveItem(txContext, input.inventoryItemId);
    const reservedActive = await sumActiveReservedForItem(
      tx,
      context.organizationId,
      item.id,
    );

    try {
      assertCanReserve({
        quantityOnHand: item.quantityOnHand,
        reservedActive,
        reserveQuantity: quantity,
      });
    } catch (error) {
      throw new DomainRuleError(
        error instanceof Error ? error.message : 'Insufficient available quantity',
        'assets.errors.insufficientAvailable',
      );
    }

    const reservation = await insertInventoryReservation(tx, {
      organizationId: context.organizationId,
      inventoryItemId: item.id,
      projectId: target.projectId,
      workOrderId: target.workOrderId,
      quantity,
      status: 'active',
      notes: input.notes ?? null,
      createdByUserId: context.userId,
    });

    await noteModuleUsage(tx, context.organizationId, 'assets');
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_RESERVED,
      entityType: 'inventory_reservation',
      entityId: reservation.id,
      after: {
        id: reservation.id,
        inventoryItemId: item.id,
        quantity: reservation.quantity,
        projectId: reservation.projectId,
        workOrderId: reservation.workOrderId,
        actual: false,
        gl: false,
      },
    });

    return reservation;
  });
}

export async function releaseInventoryReservation(
  context: OrgContext,
  raw: ReleaseInventoryReservationInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(releaseInventoryReservationSchema.safeParse(raw));

  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    const peeked = await findInventoryReservationById(
      tx,
      context.organizationId,
      input.reservationId,
    );
    if (!peeked) throw new NotFoundError('Inventory reservation');

    await lockInventoryItemRow(tx, context.organizationId, peeked.inventoryItemId);
    const current = await lockInventoryReservationForUpdate(
      tx,
      context.organizationId,
      peeked.id,
    );
    if (!current) throw new NotFoundError('Inventory reservation');
    if (current.status === 'released') {
      return current;
    }
    if (current.status !== 'active') {
      throw new DomainRuleError(
        'Reservation is not active',
        'assets.errors.reservationNotActive',
      );
    }

    const updated = await updateInventoryReservationById(
      tx,
      context.organizationId,
      current.id,
      { status: 'released', releasedAt: new Date() },
      { fromStatuses: ['active'], expectedQuantity: current.quantity },
    );
    if (!updated) throw new ConflictError('Inventory reservation was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INVENTORY_RESERVATION_RELEASED,
      entityType: 'inventory_reservation',
      entityId: updated.id,
      before: { status: current.status, quantity: current.quantity },
      after: { status: updated.status, releasedAt: updated.releasedAt },
    });
    return updated;
  });
}

/**
 * Consume active reservation qty when issuing stock. Linked reservation first;
 * otherwise matching project / work-order reservations. Returns qty still
 * unaccounted for after consumes.
 *
 * Locks the inventory item then each reservation row FOR UPDATE so concurrent
 * issue/release cannot double-consume the same reserved quantity.
 */
export async function consumeReservationsForIssue(
  context: OrgContext,
  input: {
    readonly inventoryItemId: string;
    readonly issueQuantity: string;
    readonly reservationId?: string | null;
    readonly projectId?: string | null;
    readonly workOrderId?: string | null;
  },
): Promise<string> {
  return withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);
    await lockInventoryItemRow(tx, context.organizationId, input.inventoryItemId);

    let remainingIssue = normalizeQuantity(input.issueQuantity);

    const consumeLocked = async (reservationId: string, requestedQty: string) => {
      const reservation = await lockInventoryReservationForUpdate(
        tx,
        context.organizationId,
        reservationId,
      );
      if (!reservation) throw new NotFoundError('Inventory reservation');
      if (reservation.inventoryItemId !== input.inventoryItemId) {
        throw new DomainRuleError(
          'Reservation does not match this item',
          'assets.errors.reservationNotActive',
        );
      }
      if (reservation.status !== 'active') {
        return '0.000000';
      }

      const take = Decimal.min(requestedQty, reservation.quantity).toFixed(6);
      if (new Decimal(take).lte(0)) return '0.000000';

      const split = remainingReservationAfterConsume({
        reservedQuantity: reservation.quantity,
        consumeQuantity: take,
      });
      const cas = {
        fromStatuses: ['active'] as const,
        expectedQuantity: reservation.quantity,
      };
      const updated = split.consumedFully
        ? await updateInventoryReservationById(
            tx,
            context.organizationId,
            reservation.id,
            { status: 'consumed', releasedAt: new Date() },
            cas,
          )
        : await updateInventoryReservationById(
            tx,
            context.organizationId,
            reservation.id,
            { quantity: split.remaining },
            cas,
          );
      if (!updated) {
        throw new ConflictError('Inventory reservation was updated concurrently');
      }
      await recordAuditEvent(txContext, {
        action: AUDIT_ACTIONS.INVENTORY_RESERVATION_CONSUMED,
        entityType: 'inventory_reservation',
        entityId: reservation.id,
        after: {
          consumedQuantity: take,
          remaining: split.remaining,
          consumedFully: split.consumedFully,
          actual: false,
        },
      });
      return take;
    };

    if (input.reservationId) {
      const reservation = await lockInventoryReservationForUpdate(
        tx,
        context.organizationId,
        input.reservationId,
      );
      if (!reservation) throw new NotFoundError('Inventory reservation');
      if (reservation.inventoryItemId !== input.inventoryItemId) {
        throw new DomainRuleError(
          'Reservation does not match this item',
          'assets.errors.reservationNotActive',
        );
      }
      if (reservation.status !== 'active') {
        throw new DomainRuleError(
          'Reservation is not active',
          'assets.errors.reservationNotActive',
        );
      }
      const take = await consumeLocked(reservation.id, remainingIssue);
      remainingIssue = new Decimal(remainingIssue).minus(take).toFixed(6);
    }

    if (new Decimal(remainingIssue).lte(0)) return '0.000000';

    const candidates = await listInventoryReservations(tx, context.organizationId, {
      inventoryItemId: input.inventoryItemId,
      status: 'active',
    });
    const linked = candidates
      .filter((row) => {
        if (input.reservationId && row.id === input.reservationId) return false;
        if (input.workOrderId && row.workOrderId === input.workOrderId) return true;
        if (input.projectId && row.projectId === input.projectId) return true;
        return false;
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const reservation of linked) {
      if (new Decimal(remainingIssue).lte(0)) break;
      const take = await consumeLocked(reservation.id, remainingIssue);
      remainingIssue = new Decimal(remainingIssue).minus(take).toFixed(6);
    }

    return remainingIssue;
  });
}
