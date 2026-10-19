import 'server-only';

import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { emitNotification } from '@/modules/notifications/application/emit';
import {
  finishMaterialPressureAlertDelivery,
  loadMaterialPressureAlertHistory,
} from '@/modules/notifications/application/material-pressure-delivery';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listUserIdsWithPermission } from '@/modules/notifications';
import { MATERIAL_TRADES, type MaterialTrade } from '../domain/types';
import {
  materialPressureEventSignatureFromMetadata,
  planMaterialPressureEmit,
} from '../domain/pressure-alert-policy';
import { loadLatestSnapshotsForTrades } from '../data/repositories';

/** Pressure score threshold that triggers an alert (0-100 scale). */
const HIGH_PRESSURE_THRESHOLD = 75;

/**
 * 1-month delta threshold: if the score increased by more than this in a single month,
 * emit an "accelerating pressure" alert even if absolute score is below threshold.
 */
const SIGNIFICANT_DELTA_THRESHOLD = 15;

interface PressureAlertPayload {
  trade: MaterialTrade;
  score: number;
  delta: number | null;
  reason: 'high_pressure' | 'significant_delta';
}

async function emitPressureAlertsForOrg(
  context: OrgContext,
  alerts: PressureAlertPayload[],
): Promise<number> {
  if (alerts.length === 0) return 0;

  const recipientIds = await listUserIdsWithPermission(
    context.db,
    context.organizationId,
    PERMISSIONS.PROCUREMENT_READ,
  );

  if (recipientIds.length === 0) return 0;

  let emitted = 0;
  for (const alert of alerts) {
    const scoreRounded = Math.round(alert.score);

    for (const recipientUserId of recipientIds) {
      const history = await loadMaterialPressureAlertHistory(
        context.organizationId,
        recipientUserId,
        alert.trade,
      );
      const plan = planMaterialPressureEmit(
        history.map((row) => ({
          dedupeKey: row.dedupeKey,
          eventSignature: materialPressureEventSignatureFromMetadata(row.metadata),
          readAt: row.readAt,
          resolvedAt: row.resolvedAt,
        })),
        { trade: alert.trade, reason: alert.reason, score: scoreRounded },
      );

      try {
        await emitNotification(context, {
          recipientUserId,
          type: 'material_pressure_alert',
          title: 'material_pressure_alert',
          body: 'material_pressure_alert',
          dedupeKey: plan.dedupeKey,
          severity: alert.reason === 'high_pressure' ? 'warning' : 'info',
          entityType: 'material_trade',
          entityId: null,
          deepLink: `/material-market/${alert.trade}`,
          metadata: {
            i18n: true,
            trade: alert.trade,
            score: scoreRounded,
            delta: alert.delta,
            reason: alert.reason,
            eventSignature: plan.eventSignature,
          },
        });
        await finishMaterialPressureAlertDelivery({
          organizationId: context.organizationId,
          recipientUserId,
          trade: alert.trade,
          keepDedupeKey: plan.dedupeKey,
          reopenRead: plan.reopenRead,
          preserveRead: plan.preserveRead,
        });
        emitted += 1;
      } catch {
        // Non-fatal — continue with remaining recipients
      }
    }
  }
  return emitted;
}

export interface MaterialPressureAlertResult {
  readonly scanned: number;
  readonly alertsDetected: number;
  readonly emitted: number;
  readonly failed: number;
  readonly failures: readonly { organizationId: string; error: string }[];
}

/**
 * Material market pressure alert scanner.
 *
 * Run daily from the ops-worker. Checks the latest trade pressure snapshots
 * and emits in-app notifications to users with PROCUREMENT_READ when:
 *   1. Any trade's pressure score exceeds HIGH_PRESSURE_THRESHOLD (75/100), OR
 *   2. Any trade's 1-month score delta exceeds SIGNIFICANT_DELTA_THRESHOLD (15 pts)
 *
 * Dedupe key: `material_pressure_alert:{trade}` — one open alert per trade per recipient.
 * Repeating the same reason and score does not create another row and does not
 * clear read state. A new reason or score replaces older rows for that trade.
 * Older rows are resolved, not deleted.
 *
 * NOTE: To activate, add `await runMaterialPressureAlertScan()` to
 * `src/app/api/internal/ops-worker/route.ts` in the daily job handler.
 *
 * DISCLAIMER: Pressure scores are indication tools based on CBS/FRED public
 * indices. They are NOT forecasts and should not drive automated purchasing.
 */
export async function runMaterialPressureAlertScan(): Promise<MaterialPressureAlertResult> {
  const db = getAdminDb();

  // Load latest snapshots for all trades (global, admin DB)
  const snapshotMap = await loadLatestSnapshotsForTrades(db, [...MATERIAL_TRADES]);

  // Detect which trades need alerts
  const alerts: PressureAlertPayload[] = [];
  for (const trade of MATERIAL_TRADES) {
    const snap = snapshotMap.get(trade);
    if (!snap) continue;

    const score = snap.pressureScore;
    const delta = snap.pressureScore1mChange;

    if (score >= HIGH_PRESSURE_THRESHOLD) {
      alerts.push({ trade, score, delta, reason: 'high_pressure' });
    } else if (delta !== null && delta >= SIGNIFICANT_DELTA_THRESHOLD) {
      alerts.push({ trade, score, delta, reason: 'significant_delta' });
    }
  }

  // No alerts — short-circuit
  if (alerts.length === 0) {
    return { scanned: 0, alertsDetected: 0, emitted: 0, failed: 0, failures: [] };
  }

  // Fan out to all active orgs
  const orgRows = await listActiveOrganizationIds(db);

  let totalEmitted = 0;
  let failed = 0;
  const failures: { organizationId: string; error: string }[] = [];

  for (const orgRow of orgRows) {
    try {
      const owner = await findActiveOrgOwnerUserId(db, orgRow.id);
      if (!owner) continue;

      const locale = orgRow.defaultLocale || 'he-IL';
      const emitted = await withUserContext(owner.userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.userId,
          organizationId: orgRow.id,
          locale,
        });
        return emitPressureAlertsForOrg(context, alerts);
      });
      totalEmitted += emitted;
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId: orgRow.id,
        error: error instanceof Error && error.message ? error.message : 'unknown',
      });
    }
  }

  return {
    scanned: orgRows.length,
    alertsDetected: alerts.length,
    emitted: totalEmitted,
    failed,
    failures,
  };
}
