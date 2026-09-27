/**
 * Task 3: Quote expiry scanner.
 *
 * Scans quotes that are expiring within the next EXPIRY_WARN_DAYS days and emits
 * `action_required` in-app notifications to users with QUOTES_MANAGE permission.
 * Also auto-transitions `sent` quotes past their validity date to `expired`.
 *
 * Integration: Call `runQuoteExpiryScan()` from the ops-worker or a dedicated
 * cron endpoint. Pattern mirrors `runNotificationScanOpsWorker`.
 *
 * NOTE: The file `src/app/api/internal/ops-worker/route.ts` is read-only per
 * current constraints. To activate the daily cron, add:
 *   const quoteExpiry = await runQuoteExpiryScan().catch(...)
 * to the ops-worker and include it in the returned JSON.
 */

import 'server-only';

import { and, eq, gt, isNull, lte, not } from 'drizzle-orm';
import { estimates } from '@drizzle/schema/next-gen';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { addDays, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { emitNotification } from '@/modules/notifications/application/emit';
import { listUserIdsWithPermission } from '@/modules/notifications/data/permission-holders.repository';
import { buildDedupeKey } from '@/modules/notifications/domain/dedupe';
import { listActiveOrganizationIds, resolveOrgContext } from '@/modules/tenancy';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { updateQuoteById } from '../data/quotes.repository';

/** Quotes expiring within this many days trigger a warning notification. */
const EXPIRY_WARN_DAYS = 3;

/** Per-org scan cap. */
const SCAN_CAP = 200;

export interface QuoteExpiryScanResult {
  readonly orgsScanned: number;
  readonly notificationsEmitted: number;
  readonly quotesAutoExpired: number;
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
 * Scans all active organizations for:
 * a) `sent` quotes past their validityDate → auto-transition to `expired`.
 * b) `sent` quotes expiring within the next EXPIRY_WARN_DAYS days → emit `action_required` warning.
 *
 * Safe to call multiple times (dedupe key prevents duplicate notifications).
 * Errors per org are captured and the scan continues with the next org.
 */
export async function runQuoteExpiryScan(): Promise<QuoteExpiryScanResult> {
  const db = getAdminDb();
  const orgRows = await listActiveOrganizationIds(db);

  let orgsScanned = 0;
  let notificationsEmitted = 0;
  let quotesAutoExpired = 0;
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

      const locale = orgRow.defaultLocale || 'he-IL';
      const result = await withOrgOwnerContext(owner.userId, orgRow.id, locale, (context) =>
        scanOrgQuoteExpiry(context),
      );
      orgsScanned += 1;
      notificationsEmitted += result.emitted;
      quotesAutoExpired += result.expired;
    } catch (error) {
      failed += 1;
      failures.push({
        organizationId: orgRow.id,
        error: error instanceof Error && error.message.trim() ? error.message : 'unknown',
      });
    }
  }

  return { orgsScanned, notificationsEmitted, quotesAutoExpired, failed, failures };
}

async function scanOrgQuoteExpiry(
  context: OrgContext,
): Promise<{ emitted: number; expired: number }> {
  const today = todayInTimeZone(context.organization.timezone) as BusinessDate;
  const warnCutoff = addDays(today, EXPIRY_WARN_DAYS);
  const organizationId = context.organizationId;

  let emitted = 0;
  let expired = 0;

  // ── 1. Auto-expire: sent quotes whose validityDate has passed ─────────────
  const overdueQuotes = await context.db
    .select({ id: estimates.id })
    .from(estimates)
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        eq(estimates.status, 'sent'),
        isNull(estimates.archivedAt),
        not(isNull(estimates.validityDate)),
        lte(estimates.validityDate, today),
      ),
    )
    .limit(SCAN_CAP);

  for (const quote of overdueQuotes) {
    await updateQuoteById(context.db, organizationId, quote.id, {
      status: 'expired',
      decidedAt: new Date(),
    });
    expired += 1;
  }

  // ── 2. Warn: sent quotes expiring within the next N days ──────────────────
  const expiringQuotes = await context.db
    .select({
      id: estimates.id,
      title: estimates.title,
      validityDate: estimates.validityDate,
    })
    .from(estimates)
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        eq(estimates.status, 'sent'),
        isNull(estimates.archivedAt),
        not(isNull(estimates.validityDate)),
        gt(estimates.validityDate, today),
        lte(estimates.validityDate, warnCutoff),
      ),
    )
    .limit(SCAN_CAP);

  if (expiringQuotes.length === 0) return { emitted, expired };

  const recipients = await listUserIdsWithPermission(
    context.db,
    organizationId,
    PERMISSIONS.QUOTES_MANAGE,
    SCAN_CAP,
  );

  for (const quote of expiringQuotes) {
    for (const recipientUserId of recipients) {
      await emitNotification(context, {
        recipientUserId,
        type: 'action_required',
        title: `Quote expiring soon: ${quote.title}`,
        body: [
          `This quote expires on ${quote.validityDate ?? 'soon'}.`,
          `Please confirm acceptance or follow up with the client before the deadline.`,
        ].join(' '),
        // Stable dedupe key: one notification per quote per recipient per scan cycle.
        dedupeKey: buildDedupeKey('action_required', quote.id, recipientUserId),
        severity: 'warning',
        entityType: 'estimate_quote',
        entityId: quote.id,
        deepLink: `/quotes/${quote.id}`,
      });
      emitted += 1;
    }
  }

  return { emitted, expired };
}
