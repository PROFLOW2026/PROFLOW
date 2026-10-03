import { DomainRuleError } from '@/shared/errors';
import {
  CONTRACTOR_REPORTABLE_STATES,
  OPEN_DELIVERY_STATES,
  type DeliveryItemRecord,
  type DeliveryState,
  type DeliveryWithStatus,
} from './types';

const DAY_MS = 86_400_000;

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(year!, (month ?? 1) - 1, day ?? 1);
}

export function dayDiff(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function isOpenDeliveryState(state: DeliveryState): boolean {
  return OPEN_DELIVERY_STATES.includes(state);
}

const TRANSITIONS: Readonly<Record<DeliveryState, readonly DeliveryState[]>> = {
  planned: ['ordered', 'in_transit', 'partially_delivered', 'delivered', 'cancelled'],
  ordered: ['planned', 'in_transit', 'partially_delivered', 'delivered', 'rejected', 'cancelled'],
  in_transit: ['ordered', 'partially_delivered', 'delivered', 'rejected', 'cancelled'],
  partially_delivered: ['in_transit', 'delivered', 'rejected', 'cancelled'],
  delivered: ['partially_delivered', 'rejected'],
  rejected: ['ordered', 'in_transit', 'cancelled'],
  cancelled: ['planned'],
};

export function canTransitionDelivery(from: DeliveryState, to: DeliveryState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function assertDeliveryTransition(
  from: DeliveryState,
  to: DeliveryState,
  actor: 'internal' | 'external',
): void {
  if (!canTransitionDelivery(from, to)) {
    throw new DomainRuleError(`Cannot move delivery from ${from} to ${to}`, 'deliveries.errors.invalidTransition');
  }
  if (actor === 'external' && from !== to && !CONTRACTOR_REPORTABLE_STATES.includes(to)) {
    throw new DomainRuleError('Contractors cannot set this delivery state', 'deliveries.errors.contractorStateNotAllowed');
  }
  if (actor === 'external' && !isOpenDeliveryState(from) && from !== to) {
    throw new DomainRuleError('Delivery is closed', 'deliveries.errors.closed');
  }
}

/** Arrival states need the actual date (DB CHECK mirrors this). */
export function assertArrivalDate(state: DeliveryState, actualDate: string | null): void {
  if ((state === 'delivered' || state === 'partially_delivered') && !actualDate) {
    throw new DomainRuleError('Actual delivery date is required', 'deliveries.errors.actualDateRequired');
  }
}

export function isDeliveryDelayed(
  item: Pick<DeliveryItemRecord, 'state' | 'expectedDate' | 'actualDate'>,
  today: string,
): boolean {
  if (!item.expectedDate) return false;
  if (isOpenDeliveryState(item.state)) return item.expectedDate < today;
  if (item.state === 'delivered' && item.actualDate) return item.actualDate > item.expectedDate;
  return false;
}

export function deliveryDelayDays(
  item: Pick<DeliveryItemRecord, 'state' | 'expectedDate' | 'actualDate'>,
  today: string,
): number {
  if (!item.expectedDate) return 0;
  if (isOpenDeliveryState(item.state)) return Math.max(0, dayDiff(item.expectedDate, today));
  if (item.state === 'delivered' && item.actualDate) return Math.max(0, dayDiff(item.expectedDate, item.actualDate));
  return 0;
}

export function withDeliveryStatus(item: DeliveryItemRecord, today: string): DeliveryWithStatus {
  return {
    ...item,
    delayed: isDeliveryDelayed(item, today),
    delayDays: deliveryDelayDays(item, today),
    slippageDays:
      item.originalExpectedDate && item.expectedDate ? dayDiff(item.originalExpectedDate, item.expectedDate) : 0,
  };
}

/** Expected date pushed later than the previous promise (contractor delay notice or reschedule). */
export function isRescheduledLater(previousExpected: string | null, nextExpected: string | null): boolean {
  return previousExpected !== null && nextExpected !== null && nextExpected > previousExpected;
}

/** Scan dedupe: notify once per expected date that passed while still open. */
export function needsDelayNotification(
  item: Pick<DeliveryItemRecord, 'state' | 'expectedDate' | 'delayNotifiedFor'>,
  today: string,
): boolean {
  return (
    isOpenDeliveryState(item.state) &&
    item.expectedDate !== null &&
    item.expectedDate < today &&
    item.delayNotifiedFor !== item.expectedDate
  );
}

/** Sort for site boards: delayed first, then by expected date, undated last. */
export function compareDeliveriesForBoard(a: DeliveryWithStatus, b: DeliveryWithStatus): number {
  if (a.delayed !== b.delayed) return a.delayed ? -1 : 1;
  if (a.expectedDate === b.expectedDate) return a.itemName.localeCompare(b.itemName);
  if (!a.expectedDate) return 1;
  if (!b.expectedDate) return -1;
  return a.expectedDate < b.expectedDate ? -1 : 1;
}
