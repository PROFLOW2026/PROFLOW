import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { serverEnv } from '@/shared/env/server';
import { listPendingWebhookDeliveries } from '../data/api.repository';
import { deliverPendingWebhook } from './manage-api';

/** Max delivery attempts per org per cron tick. */
export const WEBHOOK_DELIVERY_BATCH_PER_ORG = 10;

export function isWebhookDeliveryOpsEnabled(): boolean {
  return serverEnv().WEBHOOK_DELIVERY_ENABLED === 'true';
}

export interface WebhookDeliveryOpsWorkerResult {
  readonly enabled: boolean;
  readonly orgsScanned: number;
  readonly deliveriesAttempted: number;
  readonly delivered: number;
  readonly failed: number;
  readonly failures: readonly { organizationId: string; error: string }[];
}

async function withOrgOwnerContext<T>(
  userId: string,
  organizationId: string,
  locale: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale });
    return fn(context);
  });
}

/**
 * Delivers pending webhook rows using signed POSTs (`deliverPendingWebhook`).
 * No-op unless `WEBHOOK_DELIVERY_ENABLED=true`.
 */
export async function runWebhookDeliveryOpsWorker(): Promise<WebhookDeliveryOpsWorkerResult> {
  if (!isWebhookDeliveryOpsEnabled()) {
    return {
      enabled: false,
      orgsScanned: 0,
      deliveriesAttempted: 0,
      delivered: 0,
      failed: 0,
      failures: [],
    };
  }

  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let deliveriesAttempted = 0;
  let delivered = 0;
  let failed = 0;
  const failures: { organizationId: string; error: string }[] = [];

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) {
        failed += 1;
        failures.push({ organizationId: orgRow.id, error: 'no_org_owner' });
        continue;
      }

      const pending = await listPendingWebhookDeliveries(
        db,
        orgRow.id,
        WEBHOOK_DELIVERY_BATCH_PER_ORG,
      );
      if (pending.length === 0) continue;

      const locale = orgRow.defaultLocale || 'he-IL';
      for (const delivery of pending) {
        deliveriesAttempted += 1;
        try {
          const outcome = await withOrgOwnerContext(owner.userId, orgRow.id, locale, (context) =>
            deliverPendingWebhook(context, delivery.id),
          );
          if (outcome.status === 'delivered') delivered += 1;
        } catch (error) {
          failed += 1;
          failures.push({
            organizationId: orgRow.id,
            error: error instanceof Error ? error.message : 'delivery_failed',
          });
        }
      }
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId: orgRow.id,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return {
    enabled: true,
    orgsScanned: orgRows.length,
    deliveriesAttempted,
    delivered,
    failed,
    failures,
  };
}
