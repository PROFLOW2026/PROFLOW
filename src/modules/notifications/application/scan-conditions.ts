/**
 * Org-scoped condition scanners. UPSERT via app.emit_notification with stable
 * dedupe keys; resolve via app.resolve_notifications when the condition is gone.
 *
 * Employee missing required report: skipped. There is no existing workforce
 * semantics for a required periodic employee report (distinct from submitted
 * timesheets, attendance open-days, or documents.is_required on files).
 * Inventing one would collide with time-entry / timesheet work owned elsewhere.
 */

import { listPendingApprovals } from '@/modules/approvals';
import { getOrganizationApPayables } from '@/modules/ap';
import { listBillingRecords } from '@/modules/billing';
import { fromNumericString, isPositiveMoney, isZeroMoney } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { addDays, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { notificationCopy } from '../domain/copy';
import { buildDedupeKey } from '../domain/dedupe';
import type {
  NotificationEventType,
  NotificationScanResult,
  NotificationSeverity,
} from '../domain/types';
import {
  listUnresolvedEntityIdsForRecipient,
  resolveNotificationsAsSystem,
  resolveNotificationsRpc,
} from '../data/notifications.repository';
import {
  SCAN_SOURCE_CAP,
  listAssignedWorkOrders,
  listClosedAssignedWorkOrderIds,
  listExpiringDocuments,
  listLowStockItems,
  listOverduePlanningTasks,
  listOverdueSafetyActions,
  listPendingBoqProgressBatches,
  listSubmittedTimesheets,
  type ScanEntity,
} from '../data/scan-sources.repository';
import { emitNotification } from './emit';
import { runNotificationScanSchema, type RunNotificationScanInput } from '../validation/schemas';

const AP_DUE_SOON_DAYS = 7;

interface ScannerContext {
  readonly context: OrgContext;
  readonly today: BusinessDate;
  readonly cap: number;
  readonly locale: string;
}

async function emitLive(
  ctx: ScannerContext,
  type: NotificationEventType,
  entityType: string,
  severity: NotificationSeverity,
  entities: readonly ScanEntity[],
  recipientFor: (entity: ScanEntity) => string,
): Promise<number> {
  let emitted = 0;
  for (const entity of entities) {
    const recipientUserId = recipientFor(entity);
    if (!recipientUserId) continue;
    const copy = notificationCopy(ctx.locale, type, {
      reference: entity.reference,
      extra: entity.extra,
    });
    await emitNotification(ctx.context, {
      recipientUserId,
      type,
      title: copy.title,
      body: copy.body,
      dedupeKey: buildDedupeKey(type, entity.id, type === 'work_order_assigned' ? recipientUserId : undefined),
      severity,
      entityType,
      entityId: entity.id,
      deepLink: entity.deepLink,
      metadata: entity.projectId ? { projectId: entity.projectId } : null,
    });
    emitted += 1;
  }
  return emitted;
}

async function resolveStaleForRecipient(
  ctx: ScannerContext,
  type: NotificationEventType,
  liveIds: ReadonlySet<string>,
): Promise<number> {
  const openIds = await listUnresolvedEntityIdsForRecipient(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.context.userId,
    type,
  );
  let resolved = 0;
  for (const entityId of openIds) {
    if (liveIds.has(entityId)) continue;
    resolved += await resolveNotificationsRpc(ctx.context.db, ctx.context.organizationId, type, entityId);
  }
  return resolved;
}

async function resolveEntityIds(
  ctx: ScannerContext,
  type: NotificationEventType,
  entityIds: readonly string[],
): Promise<number> {
  let resolved = 0;
  for (const entityId of entityIds) {
    resolved += await resolveNotificationsAsSystem(ctx.context.organizationId, type, entityId);
  }
  return resolved;
}

async function scanBillingOverdue(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const records = await listBillingRecords(ctx.context, {
    filter: 'overdue',
    limit: ctx.cap,
  });
  const entities: ScanEntity[] = records
    .filter((record) => record.status === 'finalized')
    .map((record) => ({
      id: record.id,
      reference: record.reference,
      extra: `${record.outstandingAmount.amount} ${record.outstandingAmount.currency}`,
      deepLink: `/billing/${record.id}`,
    }));
  const emitted = await emitLive(ctx, 'billing_overdue', 'billing_record', 'urgent', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(
    ctx,
    'billing_overdue',
    new Set(entities.map((row) => row.id)),
  );
  return { emitted, resolved };
}

async function scanApDue(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.AP_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const payables = await getOrganizationApPayables(ctx.context);
  const soonUntil = addDays(ctx.today, AP_DUE_SOON_DAYS);
  const dueSoon: ScanEntity[] = [];
  const overdue: ScanEntity[] = [];

  for (const bill of payables.bills) {
    const outstanding = fromNumericString(bill.outstanding, bill.currency);
    if (!outstanding || isZeroMoney(outstanding) || !isPositiveMoney(outstanding)) continue;
    if (!bill.dueDate) continue;

    const entity: ScanEntity = {
      id: bill.billId,
      reference: bill.reference,
      extra: bill.dueDate,
      deepLink: `/procurement/ap/${bill.billId}`,
    };
    if (bill.dueDate < ctx.today) {
      if (overdue.length < ctx.cap) overdue.push(entity);
    } else if (bill.dueDate <= soonUntil) {
      if (dueSoon.length < ctx.cap) dueSoon.push(entity);
    }
  }

  const emittedSoon = await emitLive(ctx, 'ap_due_soon', 'ap_bill', 'warning', dueSoon, () => ctx.context.userId);
  const emittedOverdue = await emitLive(ctx, 'ap_overdue', 'ap_bill', 'urgent', overdue, () => ctx.context.userId);
  const resolvedSoon = await resolveStaleForRecipient(ctx, 'ap_due_soon', new Set(dueSoon.map((row) => row.id)));
  const resolvedOverdue = await resolveStaleForRecipient(ctx, 'ap_overdue', new Set(overdue.map((row) => row.id)));
  return {
    emitted: emittedSoon + emittedOverdue,
    resolved: resolvedSoon + resolvedOverdue,
  };
}

async function scanApprovals(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.APPROVALS_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const pending = await listPendingApprovals(ctx.context, { limit: ctx.cap });
  const entities: ScanEntity[] = pending.map((item) => ({
    id: item.id,
    reference: item.entityType,
    extra: item.amount,
    deepLink: '/approvals',
  }));
  const emitted = await emitLive(ctx, 'approval_waiting', 'approval_request', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'approval_waiting', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

async function scanTimesheets(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (
    !hasPermission(ctx.context, PERMISSIONS.TIME_APPROVE) &&
    !hasPermission(ctx.context, PERMISSIONS.WORKFORCE_READ)
  ) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listSubmittedTimesheets(ctx.context.db, ctx.context.organizationId, ctx.cap);
  const emitted = await emitLive(ctx, 'timesheet_waiting', 'timesheet', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'timesheet_waiting', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

async function scanDocuments(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.DOCUMENTS_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listExpiringDocuments(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.today,
    ctx.cap,
  );
  const emitted = await emitLive(ctx, 'document_expiring', 'document', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'document_expiring', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

async function scanPlanning(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.PLANNING_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listOverduePlanningTasks(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.today,
    ctx.cap,
  );
  const emitted = await emitLive(ctx, 'task_overdue', 'planning_work_item', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'task_overdue', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

async function scanBoq(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (
    !hasPermission(ctx.context, PERMISSIONS.BOQ_PROGRESS_APPROVE) &&
    !hasPermission(ctx.context, PERMISSIONS.BOQ_READ)
  ) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listPendingBoqProgressBatches(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.cap,
  );
  const emitted = await emitLive(ctx, 'boq_awaiting_approval', 'boq_progress_batch', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(
    ctx,
    'boq_awaiting_approval',
    new Set(entities.map((row) => row.id)),
  );
  return { emitted, resolved };
}

async function scanWorkOrders(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.SERVICE_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listAssignedWorkOrders(ctx.context.db, ctx.context.organizationId, ctx.cap);
  const emitted = await emitLive(
    ctx,
    'work_order_assigned',
    'project_service_details',
    'info',
    entities,
    (entity) => entity.recipientUserId ?? '',
  );
  const closedIds = await listClosedAssignedWorkOrderIds(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.cap,
  );
  const liveIds = new Set(entities.map((row) => row.id));
  const staleFromInbox = await resolveStaleForRecipient(ctx, 'work_order_assigned', liveIds);
  const closedToResolve = closedIds.filter((id) => !liveIds.has(id));
  const staleClosed = await resolveEntityIds(ctx, 'work_order_assigned', closedToResolve);
  return { emitted, resolved: staleFromInbox + staleClosed };
}

async function scanLowStock(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.ASSETS_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listLowStockItems(ctx.context.db, ctx.context.organizationId, ctx.cap);
  const emitted = await emitLive(ctx, 'low_stock', 'inventory_item', 'warning', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'low_stock', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

async function scanSafety(ctx: ScannerContext): Promise<{ emitted: number; resolved: number }> {
  if (!hasPermission(ctx.context, PERMISSIONS.SAFETY_READ)) {
    return { emitted: 0, resolved: 0 };
  }
  const entities = await listOverdueSafetyActions(
    ctx.context.db,
    ctx.context.organizationId,
    ctx.today,
    ctx.cap,
  );
  const emitted = await emitLive(ctx, 'safety_action_due', 'safety_corrective_action', 'urgent', entities, () => ctx.context.userId);
  const resolved = await resolveStaleForRecipient(ctx, 'safety_action_due', new Set(entities.map((row) => row.id)));
  return { emitted, resolved };
}

const SCANNERS: readonly {
  readonly key: string;
  readonly run: (ctx: ScannerContext) => Promise<{ emitted: number; resolved: number }>;
}[] = [
  { key: 'billing_overdue', run: scanBillingOverdue },
  { key: 'ap_due', run: scanApDue },
  { key: 'approval_waiting', run: scanApprovals },
  { key: 'timesheet_waiting', run: scanTimesheets },
  { key: 'document_expiring', run: scanDocuments },
  { key: 'task_overdue', run: scanPlanning },
  { key: 'boq_awaiting_approval', run: scanBoq },
  { key: 'work_order_assigned', run: scanWorkOrders },
  { key: 'low_stock', run: scanLowStock },
  { key: 'safety_action_due', run: scanSafety },
];

export async function runNotificationScan(
  context: OrgContext,
  raw: RunNotificationScanInput = {},
): Promise<NotificationScanResult> {
  assertPermission(context, PERMISSIONS.NOTIFICATIONS_READ);

  const parsed = runNotificationScanSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const maxMs = parsed.data.maxMs ?? 4000;
  const cap = parsed.data.perScannerCap ?? SCAN_SOURCE_CAP;
  const deadline = Date.now() + maxMs;
  const today = todayInTimeZone(context.organization.timezone);
  const ctx: ScannerContext = {
    context,
    today,
    cap,
    locale: context.locale || 'he-IL',
  };

  let scannersRun = 0;
  let emitted = 0;
  let resolved = 0;
  const skipped: string[] = ['employee_missing_report'];

  for (const scanner of SCANNERS) {
    if (Date.now() > deadline) {
      skipped.push(scanner.key);
      continue;
    }
    try {
      const result = await scanner.run(ctx);
      scannersRun += 1;
      emitted += result.emitted;
      resolved += result.resolved;
    } catch {
      skipped.push(scanner.key);
    }
  }

  return { scannersRun, emitted, resolved, skipped };
}
