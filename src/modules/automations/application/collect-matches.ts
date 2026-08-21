import { listApBillsForOrg } from '@/modules/ap';
import { listBillingRecords } from '@/modules/billing';
import { getOrganizationEarlyWarnings } from '@/modules/forecast';
import { getOcrQueueSnapshot } from '@/modules/ocr';
import { listQuotesForOrg } from '@/modules/quotes';
import { listTimesheetsForOrg } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { AutomationMatch, AutomationPresetKey } from '../domain/types';

const MATCH_CAP = 20;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function collectPresetMatches(
  context: OrgContext,
  presetKey: AutomationPresetKey,
): Promise<AutomationMatch[]> {
  const today = todayInTimeZone(context.organization.timezone);

  switch (presetKey) {
    case 'client_balance_overdue': {
      if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return [];
      const records = await safe(
        () => listBillingRecords(context, { filter: 'overdue', limit: MATCH_CAP }),
        [],
      );
      return records.map((row) => ({
        entityType: 'billing_record',
        entityId: row.id,
        title: row.reference ?? row.projectName ?? 'Overdue balance',
        body: 'Client balance is past due.',
        href: `/billing/${row.id}`,
        projectId: row.projectId,
        amount: row.outstandingAmount?.amount ?? null,
        currency: row.outstandingAmount?.currency ?? row.totalAmount?.currency ?? null,
      }));
    }
    case 'quote_no_followup': {
      if (!hasPermission(context, PERMISSIONS.QUOTES_READ)) return [];
      const quotes = await safe(() => listQuotesForOrg(context, { status: 'sent' }), []);
      return quotes.slice(0, MATCH_CAP).map((row) => ({
        entityType: 'quote',
        entityId: row.id,
        title: row.title,
        body: 'Issued quote with no follow-up message tracked here.',
        href: `/quotes/${row.id}`,
        projectId: row.convertedProjectId,
      }));
    }
    case 'vendor_bill_due': {
      if (!hasPermission(context, PERMISSIONS.AP_READ)) return [];
      const bills = await safe(() => listApBillsForOrg(context, { limit: 200 }), []);
      return bills
        .filter((bill) => bill.dueDate && bill.dueDate <= today && bill.status !== 'void')
        .slice(0, MATCH_CAP)
        .map((bill) => ({
          entityType: 'ap_bill',
          entityId: bill.id,
          title: bill.vendorName ?? bill.reference ?? 'Supplier bill',
          body: 'Supplier bill has reached its due date.',
          href: `/procurement/ap/${bill.id}`,
          projectId: bill.projectId,
          amount: bill.totalAmount ?? null,
          currency: bill.currency ?? null,
        }));
    }
    case 'timesheet_not_submitted': {
      if (!hasPermission(context, PERMISSIONS.WORKFORCE_READ)) return [];
      const sheets = await safe(
        () => listTimesheetsForOrg(context, { status: 'draft' }),
        [],
      );
      return sheets.slice(0, MATCH_CAP).map((row) => ({
        entityType: 'timesheet',
        entityId: row.id,
        title: 'Timesheet not submitted',
        body: 'A timesheet is still a draft.',
        href: `/workforce/timesheets/${row.id}`,
      }));
    }
    case 'timesheet_waiting_approval': {
      if (!hasPermission(context, PERMISSIONS.TIME_APPROVE)) return [];
      const sheets = await safe(
        () => listTimesheetsForOrg(context, { status: 'submitted' }),
        [],
      );
      return sheets.slice(0, MATCH_CAP).map((row) => ({
        entityType: 'timesheet',
        entityId: row.id,
        title: 'Timesheet waiting for approval',
        body: 'A timesheet is waiting for approval.',
        href: `/workforce/timesheets/${row.id}`,
      }));
    }
    case 'ocr_waiting_review': {
      if (
        !hasPermission(context, PERMISSIONS.SETTINGS_MANAGE) &&
        !hasPermission(context, PERMISSIONS.DOCUMENTS_READ)
      ) {
        return [];
      }
      const snapshot = await safe(() => getOcrQueueSnapshot(context), {
        queued: 0,
        processing: 0,
        failed: 0,
        needsReview: 0,
        jobs: [],
      });
      if (snapshot.needsReview <= 0) return [];
      return [
        {
          entityType: 'ocr_queue',
          entityId: context.organizationId,
          title: 'Invoice capture waiting for review',
          body: `${snapshot.needsReview} capture jobs need review.`,
          href: '/settings/ocr',
        },
      ];
    }
    case 'forecast_over_budget': {
      if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];
      const warnings = await safe(() => getOrganizationEarlyWarnings(context), []);
      return warnings
        .filter((item) => item.kind === 'projected_cost_over_budget' || item.kind === 'actual_over_budget')
        .slice(0, MATCH_CAP)
        .map((item) => ({
          entityType: 'project',
          entityId: item.projectId,
          title: 'Forecast over budget',
          body: item.kind,
          href: item.href,
          projectId: item.projectId,
        }));
    }
    case 'forecast_margin_low': {
      if (!hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];
      const warnings = await safe(() => getOrganizationEarlyWarnings(context), []);
      return warnings
        .filter((item) => item.kind === 'forecast_margin_negative' || item.kind === 'margin_deterioration')
        .slice(0, MATCH_CAP)
        .map((item) => ({
          entityType: 'project',
          entityId: item.projectId,
          title: 'Forecast margin low',
          body: item.kind,
          href: item.href,
          projectId: item.projectId,
        }));
    }
    case 'warranty_expiring':
    case 'compliance_expiring':
    case 'asset_service_due':
    case 'retention_release_date':
    case 'closeout_has_blockers':
      return [];
    default:
      return [];
  }
}
