import 'server-only';

import { getAdminDb, withUserContext } from '@/shared/db/client';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { emitNotification } from '@/modules/notifications/application/emit';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listUserIdsWithPermission } from '@/modules/notifications/data/permission-holders.repository';
import { MATERIAL_TRADES, type MaterialTrade } from '../domain/types';
import { loadLatestSnapshotsForTrades } from '../data/repositories';

/** Pressure score threshold that triggers an alert (0-100 scale). */
const HIGH_PRESSURE_THRESHOLD = 75;

/**
 * 1-month delta threshold: if the score increased by more than this in a single month,
 * emit an "accelerating pressure" alert even if absolute score is below threshold.
 */
const SIGNIFICANT_DELTA_THRESHOLD = 15;

/** ISO week number for a date (YYYY-Www format), used for dedupe key. */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
}

function tradeLabelEn(trade: MaterialTrade): string {
  switch (trade) {
    case 'electrical': return 'Electrical';
    case 'plumbing': return 'Plumbing';
    case 'steel_rebar': return 'Steel / Rebar';
    case 'concrete': return 'Concrete / Cement';
  }
}

function tradeLabelHe(trade: MaterialTrade): string {
  switch (trade) {
    case 'electrical': return 'חשמל';
    case 'plumbing': return 'אינסטלציה';
    case 'steel_rebar': return 'ברזל זיון';
    case 'concrete': return 'בטון / מלט';
  }
}

interface PressureAlertPayload {
  trade: MaterialTrade;
  score: number;
  delta: number | null;
  reason: 'high_pressure' | 'significant_delta';
}

async function emitPressureAlertsForOrg(
  context: OrgContext,
  alerts: PressureAlertPayload[],
  week: string,
): Promise<number> {
  if (alerts.length === 0) return 0;

  // Recipients: all users with procurement read permission
  const recipientIds = await listUserIdsWithPermission(
    context.db,
    context.organizationId,
    PERMISSIONS.PROCUREMENT_READ,
  );

  if (recipientIds.length === 0) return 0;

  let emitted = 0;
  for (const alert of alerts) {
    const tradeEn = tradeLabelEn(alert.trade);
    const tradeHe = tradeLabelHe(alert.trade);
    const scoreRounded = Math.round(alert.score);

    const title =
      alert.reason === 'high_pressure'
        ? `⚠️ High material pressure: ${tradeEn} (${scoreRounded}/100)`
        : `⚠️ Rising pressure: ${tradeEn} (${scoreRounded}/100)`;

    const deltaStr =
      alert.delta !== null
        ? ` 1-month change: ${alert.delta > 0 ? '+' : ''}${alert.delta.toFixed(1)} pts.`
        : '';

    const body =
      `${tradeHe}: לחץ שוק מחומרים נמצא ב-${scoreRounded}/100.${deltaStr} ` +
      `בדוק מחירי ספקים לפני הוצאת הזמנות רכש. ` +
      `זהו מדד הסתברותי בלבד ואינו תחזית מחייבת.`;

    for (const recipientUserId of recipientIds) {
      // Stable dedupe key: one alert per trade per org per week
      const dedupeKey = `material_pressure_alert:${alert.trade}:${week}`;

      try {
        await emitNotification(context, {
          recipientUserId,
          type: 'material_pressure_alert',
          title,
          body,
          dedupeKey,
          severity: alert.reason === 'high_pressure' ? 'warning' : 'info',
          entityType: 'material_trade',
          entityId: null,
          deepLink: `/material-market/${alert.trade}`,
          metadata: {
            trade: alert.trade,
            score: scoreRounded,
            delta: alert.delta,
            reason: alert.reason,
            week,
          },
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
 * Dedupe key: `material_pressure_alert:{tradeId}:{isoWeek}` — prevents daily spam
 * by ensuring at most one alert per trade per org per week.
 *
 * NOTE: To activate, add `await runMaterialPressureAlertScan()` to
 * `src/app/api/internal/ops-worker/route.ts` in the daily job handler.
 *
 * DISCLAIMER: Pressure scores are indication tools based on CBS/FRED public
 * indices. They are NOT forecasts and should not drive automated purchasing.
 */
export async function runMaterialPressureAlertScan(): Promise<MaterialPressureAlertResult> {
  const db = getAdminDb();
  const week = isoWeek(new Date());

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
        return emitPressureAlertsForOrg(context, alerts, week);
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
