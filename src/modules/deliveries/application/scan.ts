import { SYSTEM_ACTOR } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { deliveryDelayDays, needsDelayNotification, withDeliveryStatus } from '../domain/rules';
import { DELIVERY_ITEM_ENTITY, type DeliveryWithStatus } from '../domain/types';
import {
  listDelayCandidates,
  listDelayedOpenItems,
  updateDeliveryItemRow,
  vendorNames,
} from '../data/deliveries.repository';

/**
 * Delay detection scan (SYSTEM actor, service-role executor; wired by Track T's worker).
 * Emits `delivery.item.delayed` once per (item, expected date) that passed while the item was open.
 */
export async function runDeliveryDelayScan(
  db: DbExecutor,
  options: { readonly today?: string; readonly organizationId?: string; readonly limit?: number } = {},
): Promise<{ readonly scanned: number; readonly delayed: number }> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const candidates = await listDelayCandidates(db, {
    today,
    organizationId: options.organizationId,
    limit: Math.min(Math.max(options.limit ?? 500, 1), 2_000),
  });
  let delayed = 0;
  for (const item of candidates) {
    if (!needsDelayNotification(item, today)) continue;
    await updateDeliveryItemRow(db, item.organizationId, item.id, { delayNotifiedFor: item.expectedDate });
    await emitDomainEvent(db, {
      organizationId: item.organizationId,
      projectId: item.projectId,
      type: DOMAIN_EVENTS.DELIVERY_ITEM_DELAYED,
      entityType: DELIVERY_ITEM_ENTITY,
      entityId: item.id,
      actor: SYSTEM_ACTOR,
      payload: {
        reason: 'overdue',
        vendorId: item.vendorId,
        isCritical: item.isCritical,
        expectedDate: item.expectedDate,
        delayDays: deliveryDelayDays(item, today),
      },
    });
    delayed += 1;
  }
  return { scanned: candidates.length, delayed };
}

export interface DelayedDeliveryItem extends DeliveryWithStatus {
  readonly vendorName: string | null;
}

/** Command Center feed: delayed open deliveries across the caller's visible projects (RLS). */
export async function listDelayedDeliveriesForOrg(
  context: OrgContext,
  options: { readonly projectId?: string; readonly criticalOnly?: boolean; readonly limit?: number } = {},
): Promise<readonly DelayedDeliveryItem[]> {
  const today = todayInTimeZone(context.organization.timezone) as string;
  const items = await listDelayedOpenItems(context.db, context.organizationId, {
    today,
    projectId: options.projectId,
    criticalOnly: options.criticalOnly ?? true,
    limit: Math.min(Math.max(options.limit ?? 50, 1), 200),
  });
  const names = await vendorNames(
    context.db,
    context.organizationId,
    [...new Set(items.map((item) => item.vendorId).filter((id): id is string => Boolean(id)))],
  );
  return items.map((item) => ({
    ...withDeliveryStatus(item, today),
    vendorName: item.vendorId ? (names.get(item.vendorId) ?? null) : null,
  }));
}
