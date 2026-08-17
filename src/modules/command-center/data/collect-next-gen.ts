/**
 * Next-gen Today collectors.
 * Query schema tables directly. Skip when permission is missing or the
 * relation has not been applied yet (migrations 0056–0058).
 *
 * Expected module paths (other agents own the full modules):
 * - @/modules/closeout/application/list-closeout-blockers
 * - @/modules/warranty/application/list-expiring-coverages
 * - @/modules/communications/application/list-failed-communications
 * - @/modules/automations/application/list-followups
 */

import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  automationRules,
  automationRuns,
  outboundCommunications,
  projectCloseouts,
  projects,
  warrantyCoverages,
} from '@drizzle/schema';
import { getOrganizationCashFlowOutlook } from '@/modules/financials/application/get-organization-cash-flow';
import type { OrgContext } from '@/shared/auth/context';
import { addDays, businessDate, daysBetween, type BusinessDate } from '@/shared/dates';
import { isPositiveMoney, isZeroMoney, zeroMoney } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import { withItemDefaults } from '../domain/ranking';
import {
  automationFollowupCopy,
  cashFlowRiskCopy,
  closeoutBlockersCopy,
  communicationFailedCopy,
  fallbackWhere,
  warrantyExpiringCopy,
} from '../domain/item-copy';
import type { CommandCenterItem } from '../domain/types';

interface CollectContext {
  readonly context: OrgContext;
  readonly modules: ModuleVisibility;
  readonly today: BusinessDate;
}

const PER_SOURCE_CAP = 15;
const WARRANTY_LOOKAHEAD_DAYS = 90;

function localeOf(ctx: CollectContext): string {
  return ctx.context.locale || 'he-IL';
}

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === '42P01' ||
    code === '42703' ||
    /relation .+ does not exist/i.test(message) ||
    /column .+ does not exist/i.test(message)
  );
}

async function safeQuery<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function collectCloseoutBlockers(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECTS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: projectCloseouts.id,
        status: projectCloseouts.status,
        projectId: projectCloseouts.projectId,
        projectName: projects.name,
      })
      .from(projectCloseouts)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectCloseouts.projectId),
          eq(projects.organizationId, projectCloseouts.organizationId),
        ),
      )
      .where(
        and(
          eq(projectCloseouts.organizationId, ctx.context.organizationId),
          inArray(projectCloseouts.status, ['open', 'reopened']),
          eq(projects.workKind, 'project'),
          isNull(projects.archivedAt),
        ),
      )
      .limit(PER_SOURCE_CAP),
  );

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const copy = closeoutBlockersCopy(locale, {
      projectName: row.projectName,
      status: row.status,
    });
    return withItemDefaults({
      sourceType: 'closeout_blockers',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: row.projectName || fallbackWhere(locale, 'closeout'),
      href: `/projects/${row.projectId}?tab=closeout`,
      urgencyBump: row.status === 'reopened' ? 20 : 10,
      meta: { projectId: row.projectId, status: row.status },
    });
  });
}

export async function collectWarrantyExpiring(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECTS_READ)) return [];

  const horizon = addDays(ctx.today, WARRANTY_LOOKAHEAD_DAYS);
  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: warrantyCoverages.id,
        title: warrantyCoverages.title,
        endDate: warrantyCoverages.endDate,
        reminderDaysBefore: warrantyCoverages.reminderDaysBefore,
        projectId: warrantyCoverages.projectId,
        projectName: projects.name,
      })
      .from(warrantyCoverages)
      .innerJoin(
        projects,
        and(
          eq(projects.id, warrantyCoverages.projectId),
          eq(projects.organizationId, warrantyCoverages.organizationId),
        ),
      )
      .where(
        and(
          eq(warrantyCoverages.organizationId, ctx.context.organizationId),
          inArray(warrantyCoverages.status, ['scheduled', 'active']),
          isNull(warrantyCoverages.archivedAt),
          isNull(projects.archivedAt),
          sql`${warrantyCoverages.endDate} is not null`,
          gte(warrantyCoverages.endDate, ctx.today),
          lte(warrantyCoverages.endDate, horizon),
        ),
      )
      .limit(PER_SOURCE_CAP * 2),
  );

  const locale = localeOf(ctx);
  const items: CommandCenterItem[] = [];
  for (const row of rows) {
    if (!row.endDate) continue;
    const endDate = businessDate(row.endDate);
    const daysLeft = daysBetween(ctx.today, endDate);
    const reminder = Math.max(0, row.reminderDaysBefore ?? 30);
    if (daysLeft > reminder) continue;
    const copy = warrantyExpiringCopy(locale, { title: row.title, endDate });
    items.push(
      withItemDefaults({
        sourceType: 'warranty_expiring',
        sourceId: row.id,
        what: copy.what,
        why: copy.why,
        where: row.projectName || fallbackWhere(locale, 'warranty'),
        href: `/projects/${row.projectId}?tab=warranty`,
        urgencyBump: Math.min(99, Math.max(0, reminder - daysLeft)),
        meta: { projectId: row.projectId, endDate: row.endDate },
      }),
    );
    if (items.length >= PER_SOURCE_CAP) break;
  }
  return items;
}

export async function collectCashFlowRisk(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];

  let outlook: Awaited<ReturnType<typeof getOrganizationCashFlowOutlook>> = null;
  try {
    outlook = await getOrganizationCashFlowOutlook(ctx.context);
  } catch {
    return [];
  }
  if (!outlook) return [];

  const overdueIn = outlook.forecastBuckets.find((bucket) => bucket.key === 'overdue');
  const overdueOut =
    outlook.outgoing.available === true
      ? outlook.outgoing.forecastBuckets.find((bucket) => bucket.key === 'overdue')
      : null;

  const inAmount = overdueIn?.expectedIn ?? zeroMoney(outlook.currency);
  const outAmount =
    overdueOut && 'expectedOut' in overdueOut
      ? overdueOut.expectedOut
      : zeroMoney(outlook.currency);

  const hasIn = isPositiveMoney(inAmount) && !isZeroMoney(inAmount);
  const hasOut = isPositiveMoney(outAmount) && !isZeroMoney(outAmount);
  if (!hasIn && !hasOut) return [];

  const locale = localeOf(ctx);
  const copy = cashFlowRiskCopy(locale, {
    overdueIn: inAmount.amount,
    overdueOut: outAmount.amount,
    currency: outlook.currency,
  });
  return [
    withItemDefaults({
      sourceType: 'cash_flow_risk',
      sourceId: `org:${ctx.context.organizationId}`,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'cashFlow'),
      href: '/cash-flow',
      urgencyBump: Math.min(99, (overdueIn?.count ?? 0) + (overdueOut?.count ?? 0)),
      meta: {
        overdueIn: inAmount.amount,
        overdueOut: outAmount.amount,
        currency: outlook.currency,
      },
    }),
  ];
}

export async function collectAutomationFollowups(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.AUTOMATIONS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: automationRuns.id,
        status: automationRuns.status,
        ranAt: automationRuns.ranAt,
        errorMessage: automationRuns.errorMessage,
        presetKey: automationRules.presetKey,
      })
      .from(automationRuns)
      .innerJoin(
        automationRules,
        and(
          eq(automationRules.id, automationRuns.ruleId),
          eq(automationRules.organizationId, automationRuns.organizationId),
        ),
      )
      .where(
        and(
          eq(automationRuns.organizationId, ctx.context.organizationId),
          inArray(automationRuns.status, ['failed']),
          isNull(automationRules.archivedAt),
        ),
      )
      .orderBy(desc(automationRuns.ranAt))
      .limit(PER_SOURCE_CAP),
  );

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const ranAt = row.ranAt.toISOString().slice(0, 10);
    const copy = automationFollowupCopy(locale, { presetKey: row.presetKey, ranAt });
    return withItemDefaults({
      sourceType: 'automation_followup',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'automations'),
      href: '/automations',
      meta: { presetKey: row.presetKey, status: row.status },
    });
  });
}

export async function collectFailedCommunications(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.COMMUNICATIONS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: outboundCommunications.id,
        subject: outboundCommunications.subject,
        lastError: outboundCommunications.lastError,
        projectId: outboundCommunications.projectId,
      })
      .from(outboundCommunications)
      .where(
        and(
          eq(outboundCommunications.organizationId, ctx.context.organizationId),
          eq(outboundCommunications.status, 'failed'),
          isNull(outboundCommunications.archivedAt),
        ),
      )
      .orderBy(desc(outboundCommunications.updatedAt))
      .limit(PER_SOURCE_CAP),
  );

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const copy = communicationFailedCopy(locale, { subject: row.subject });
    return withItemDefaults({
      sourceType: 'communication_failed',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'communications'),
      href: `/communications/${row.id}`,
      meta: { projectId: row.projectId, lastError: row.lastError },
    });
  });
}
