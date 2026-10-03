import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { externalActor } from '@/shared/actor';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import {
  EXTERNAL_DEFAULT_TIMEZONE,
  externalProjectGate,
  recordExternalAudit,
} from '@/modules/contractor-compliance';
import {
  assertArrivalDate,
  assertDeliveryTransition,
  compareDeliveriesForBoard,
  isOpenDeliveryState,
  withDeliveryStatus,
} from '../domain/rules';
import {
  DELIVERY_ITEM_ENTITY,
  type DeliveryItemRecord,
  type DeliveryReportRecord,
  type DeliveryWithStatus,
} from '../domain/types';
import {
  findDeliveryItem,
  insertDeliveryItem,
  insertDeliveryReport,
  listDeliveryItems,
  listDeliveryReports,
  updateDeliveryItemRow,
} from '../data/deliveries.repository';
import {
  externalCreateDeliverySchema,
  externalReportDeliverySchema,
  type ExternalCreateDeliveryInput,
  type ExternalReportDeliveryInput,
} from '../validation/schemas';
import { emitDeliveryChangeEvents, parseInput } from './internal';

function covered(context: ExternalContext, item: DeliveryItemRecord): boolean {
  return (
    item.vendorId !== null &&
    item.contractorVisible &&
    hasExternalScope(
      context,
      {
        organizationId: item.organizationId,
        projectId: item.projectId,
        vendorId: item.vendorId,
        subcontractAgreementId: item.subcontractAgreementId,
      },
      X.DELIVERY_REPORT,
    )
  );
}

function portalToday(): string {
  return todayInTimeZone(EXTERNAL_DEFAULT_TIMEZONE) as string;
}

/** Portal list + summary for Track R: the contractor's own visible deliveries on one project. */
export async function listDeliveriesForPortal(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string; readonly today?: string },
): Promise<{ readonly items: readonly DeliveryWithStatus[]; readonly today: string }> {
  externalProjectGate(context, input.organizationId, input.projectId, X.DELIVERY_REPORT);
  const now = input.today ?? portalToday();
  const rows = await listDeliveryItems(context.db, input.organizationId, { projectId: input.projectId });
  return {
    items: rows
      .filter((row) => covered(context, row))
      .map((row) => withDeliveryStatus(row, now))
      .sort(compareDeliveriesForBoard),
    today: now,
  };
}

export async function getContractorDeliveriesSummary(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<{ readonly open: number; readonly delayed: number; readonly dueThisWeek: number }> {
  const { items, today } = await listDeliveriesForPortal(context, input);
  const weekAhead = new Date(`${today}T00:00:00Z`);
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);
  const horizon = weekAhead.toISOString().slice(0, 10);
  const open = items.filter((item) => isOpenDeliveryState(item.state));
  return {
    open: open.length,
    delayed: open.filter((item) => item.delayed).length,
    dueThisWeek: open.filter((item) => item.expectedDate && item.expectedDate >= today && item.expectedDate <= horizon)
      .length,
  };
}

export async function getDeliveryForPortal(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string; readonly deliveryItemId: string },
): Promise<DeliveryWithStatus & { readonly reports: readonly DeliveryReportRecord[] }> {
  const item = await findDeliveryItem(context.db, input.organizationId, input.deliveryItemId);
  if (!item || item.projectId !== input.projectId || !covered(context, item)) throw new NotFoundError('Delivery item');
  const reports = await listDeliveryReports(context.db, input.organizationId, item.id);
  return { ...withDeliveryStatus(item, portalToday()), reports };
}

function vendorsForProject(context: ExternalContext, organizationId: string, projectId: string): string[] {
  return [
    ...new Set(
      context.grants
        .filter(
          (grant) =>
            grant.organizationId === organizationId &&
            (grant.projectId === null || grant.projectId === projectId) &&
            grant.capabilities.has(X.DELIVERY_REPORT),
        )
        .map((grant) => grant.vendorId),
    ),
  ];
}

/** Contractor registers a critical delivery it is responsible for. */
export async function createDeliveryFromPortal(
  context: ExternalContext,
  raw: ExternalCreateDeliveryInput,
): Promise<{ readonly deliveryItemId: string }> {
  const input = parseInput(externalCreateDeliverySchema.safeParse(raw));
  const candidates = vendorsForProject(context, input.organizationId, input.projectId);
  const vendorId = input.vendorId ?? (candidates.length === 1 ? candidates[0]! : null);
  if (!vendorId || !candidates.includes(vendorId)) throw new NotFoundError('Contractor');
  requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId,
      subcontractAgreementId: input.agreementId,
    },
    X.DELIVERY_REPORT,
  );
  const id = randomUUID();
  await insertDeliveryItem(context.db, {
    id,
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorId,
    subcontractAgreementId: input.agreementId,
    itemName: input.itemName,
    description: input.description,
    itemKind: input.itemKind,
    isCritical: true,
    supplierName: input.supplierName,
    quantity: input.quantity,
    unit: input.unit,
    orderDate: input.orderDate,
    originalExpectedDate: input.expectedDate,
    expectedDate: input.expectedDate,
    state: input.orderDate ? 'ordered' : 'planned',
    locationId: input.locationId,
    contractorVisible: true,
    createdActorType: 'external',
    createdByPrincipalId: context.principalId,
  });
  await emitDomainEvent(context.db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.DELIVERY_ITEM_REPORTED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: id,
    actor: externalActor(context.principalId),
    payload: { reportKind: 'registered', vendorId, expectedDate: input.expectedDate },
  });
  await recordExternalAudit(context.db, {
    organizationId: input.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.DELIVERY_ITEM_CREATED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: id,
    after: { itemName: input.itemName, vendorId, expectedDate: input.expectedDate },
  });
  return { deliveryItemId: id };
}

/**
 * Contractor report on its own delivery: status update / delay notice / arrived / issue / note.
 * Updates the item state and dates (DB trigger forbids any other column for external principals)
 * and appends an immutable report row.
 */
export async function reportDeliveryFromPortal(
  context: ExternalContext,
  raw: ExternalReportDeliveryInput,
): Promise<void> {
  const input = parseInput(externalReportDeliverySchema.safeParse(raw));
  const before = await findDeliveryItem(context.db, input.organizationId, input.deliveryItemId);
  if (!before || before.projectId !== input.projectId || !covered(context, before)) {
    throw new NotFoundError('Delivery item');
  }
  requireExternalScope(
    context,
    {
      organizationId: before.organizationId,
      projectId: before.projectId,
      vendorId: before.vendorId!,
      subcontractAgreementId: before.subcontractAgreementId,
    },
    X.DELIVERY_REPORT,
  );

  let state = input.reportedState ?? before.state;
  if (input.reportKind === 'arrived') state = input.reportedState ?? 'delivered';
  const expectedDate = input.newExpectedDate ?? before.expectedDate;
  const actualDate = input.actualDate ?? before.actualDate;
  if (input.reportKind === 'delay_notice' && !input.newExpectedDate) {
    throw new DomainRuleError('A delay notice needs the new expected date', 'deliveries.errors.newDateRequired');
  }
  assertDeliveryTransition(before.state, state, 'external');
  assertArrivalDate(state, actualDate);

  if (state !== before.state || expectedDate !== before.expectedDate || actualDate !== before.actualDate) {
    await updateDeliveryItemRow(context.db, before.organizationId, before.id, { state, expectedDate, actualDate });
  }
  await insertDeliveryReport(context.db, {
    organizationId: before.organizationId,
    projectId: before.projectId,
    deliveryItemId: before.id,
    reportKind: input.reportKind,
    reportedState: state !== before.state ? state : input.reportedState,
    newExpectedDate: input.newExpectedDate,
    actualDate: input.actualDate,
    note: input.note,
    actorType: 'external',
    actorPrincipalId: context.principalId,
  });
  const actor = externalActor(context.principalId);
  await emitDomainEvent(context.db, {
    organizationId: before.organizationId,
    projectId: before.projectId,
    type: DOMAIN_EVENTS.DELIVERY_ITEM_REPORTED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: before.id,
    actor,
    payload: { reportKind: input.reportKind, vendorId: before.vendorId, state, expectedDate },
  });
  await emitDeliveryChangeEvents(context.db, { before, after: { state, expectedDate, actualDate }, actor });
  await recordExternalAudit(context.db, {
    organizationId: before.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.DELIVERY_ITEM_REPORTED,
    entityType: DELIVERY_ITEM_ENTITY,
    entityId: before.id,
    after: { reportKind: input.reportKind, state, expectedDate, actualDate },
  });
}
