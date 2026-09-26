import { listApBillsForOrg } from '@/modules/ap';
import { listMaintenanceScheduleForOrg } from '@/modules/assets';
import { listBillingRecords } from '@/modules/billing';
import { listPlansWithRetentionHeld } from '@/modules/billing-plan';
import { listCloseoutStatusesForProjects } from '@/modules/closeout';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { getOrganizationEarlyWarnings } from '@/modules/forecast';
import { getOcrQueueSnapshot } from '@/modules/ocr';
import { listProjectMilestones, listProjectsForOrg } from '@/modules/projects';
import { listQuotesForOrg } from '@/modules/quotes';
import { getModuleVisibility } from '@/modules/tenancy';
import { listOverdueUwmTasks } from '@/modules/tasks';
import { listOrgWarrantyCoverages } from '@/modules/warranty';
import { listTimesheetsForOrg } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, daysBetween, todayInTimeZone, addDays } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { AutomationMatch, AutomationPresetKey } from '../domain/types';

const MATCH_CAP = 20;
/** Same lookahead as command-center `collectMilestoneApproaching` when the rule has no daysAhead. */
const MILESTONE_LOOKAHEAD_DAYS = 7;
const PROJECT_SCAN_CAP = 200;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function configuredDaysAhead(config: Record<string, unknown> | undefined): number | null {
  const raw = config?.daysAhead;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function warrantyWithinReminder(
  endDate: string,
  reminderDaysBefore: number,
  today: ReturnType<typeof todayInTimeZone>,
): boolean {
  if (endDate < today) return false;
  const daysLeft = daysBetween(today, businessDate(endDate));
  const reminder = Math.max(0, reminderDaysBefore ?? 30);
  return daysLeft <= reminder;
}

export async function collectPresetMatches(
  context: OrgContext,
  presetKey: AutomationPresetKey,
  config?: Record<string, unknown>,
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
    case 'warranty_expiring': {
      if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return [];
      const coverages = await safe(() => listOrgWarrantyCoverages(context), []);
      return coverages
        .filter(
          (row) =>
            (row.status === 'scheduled' || row.status === 'active') &&
            row.endDate != null &&
            warrantyWithinReminder(row.endDate, row.reminderDaysBefore, today),
        )
        .slice(0, MATCH_CAP)
        .map((row) => ({
          entityType: 'warranty_coverage',
          entityId: row.id,
          title: row.title,
          body: row.endDate
            ? `Warranty coverage ends on ${row.endDate}.`
            : 'Warranty coverage is nearing its end date.',
          href: `/projects/${row.projectId}?tab=warranty`,
          projectId: row.projectId,
        }));
    }
    case 'compliance_expiring': {
      if (!hasPermission(context, PERMISSIONS.COMPLIANCE_READ)) return [];
      const modules = await safe(() => getModuleVisibility(context), null);
      if (!modules?.compliance) return [];
      const artifacts = await safe(
        () => listComplianceArtifactsForOrg(context, { limit: 200 }),
        [],
      );
      return artifacts
        .filter((artifact) => artifact.status === 'expiring_soon' || artifact.status === 'expired')
        .slice(0, MATCH_CAP)
        .map((artifact) => ({
          entityType: 'compliance_artifact',
          entityId: artifact.id,
          title: artifact.name,
          body: artifact.expiresOn
            ? `Compliance document is ${artifact.status} (${artifact.expiresOn}).`
            : `Compliance document is ${artifact.status}.`,
          href: `/compliance/${artifact.id}`,
        }));
    }
    case 'asset_service_due': {
      if (!hasPermission(context, PERMISSIONS.ASSETS_READ)) return [];
      const modules = await safe(() => getModuleVisibility(context), null);
      if (!modules?.assets) return [];
      const schedule = await safe(() => listMaintenanceScheduleForOrg(context), null);
      if (!schedule) return [];
      return [...schedule.overdue, ...schedule.upcoming].slice(0, MATCH_CAP).map((record) => ({
        entityType: 'maintenance_record',
        entityId: record.id,
        title: record.title || record.assetName || 'Equipment service',
        body: record.performedOn
          ? `Equipment service (${record.status}) dated ${record.performedOn}.`
          : `Equipment service is ${record.status}.`,
        href: '/assets/maintenance',
      }));
    }
    case 'retention_release_date': {
      if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return [];
      const modules = await safe(() => getModuleVisibility(context), null);
      if (!modules?.billing) return [];
      const plans = await safe(
        () => listPlansWithRetentionHeld(context.db, context.organizationId, MATCH_CAP),
        [],
      );
      return plans.map((row) => ({
        entityType: 'billing_plan',
        entityId: row.planId,
        title: row.planName || row.projectName,
        body: 'Retention is still held on this billing plan.',
        href: `/projects/${row.projectId}?tab=billingPlan`,
        projectId: row.projectId,
      }));
    }
    case 'closeout_has_blockers': {
      if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return [];
      const projects = await safe(
        () => listProjectsForOrg(context, { workKind: 'project', limit: PROJECT_SCAN_CAP }),
        [],
      );
      const statuses = await safe(
        () => listCloseoutStatusesForProjects(context, projects.map((project) => project.id)),
        [],
      );
      const byId = new Map(projects.map((project) => [project.id, project]));
      return statuses
        .filter((row) => row.status === 'open' || row.status === 'reopened')
        .slice(0, MATCH_CAP)
        .map((row) => ({
          entityType: 'closeout',
          entityId: row.projectId,
          title: byId.get(row.projectId)?.name ?? 'Project closeout',
          body: `Closeout is ${row.status}.`,
          href: `/projects/${row.projectId}?tab=closeout`,
          projectId: row.projectId,
        }));
    }
    case 'task_overdue': {
      if (!hasPermission(context, PERMISSIONS.TASKS_READ)) return [];
      const rows = await safe(
        () => listOverdueUwmTasks(context.db, context.organizationId, today, MATCH_CAP),
        [],
      );
      return rows.map((row) => ({
        entityType: 'task',
        entityId: row.id,
        taskId: row.id,
        workspaceId: row.workspaceId,
        title: row.title,
        body: 'Task is past its due date.',
        href: `/tasks/${row.id}`,
        projectId: row.projectId,
      }));
    }
    case 'milestone_approaching_days': {
      if (!hasPermission(context, PERMISSIONS.PROJECTS_READ)) return [];
      const daysAhead = configuredDaysAhead(config) ?? MILESTONE_LOOKAHEAD_DAYS;
      const horizon = addDays(today, daysAhead);
      const projects = await safe(
        () => listProjectsForOrg(context, { limit: PROJECT_SCAN_CAP }),
        [],
      );
      const matches: AutomationMatch[] = [];
      for (const project of projects) {
        if (matches.length >= MATCH_CAP) break;
        const milestones = await safe(() => listProjectMilestones(context, project.id), []);
        for (const milestone of milestones) {
          if (matches.length >= MATCH_CAP) break;
          if (milestone.status === 'achieved' || milestone.status === 'cancelled') continue;
          if (!milestone.targetDate) continue;
          if (milestone.targetDate < today || milestone.targetDate > horizon) continue;
          matches.push({
            entityType: 'milestone',
            entityId: milestone.id,
            title: milestone.name,
            body: `Milestone target date is ${milestone.targetDate}.`,
            href: `/projects/${project.id}?tab=milestones`,
            projectId: project.id,
          });
        }
      }
      return matches;
    }
    // Event presets. No org-wide scanner or list query exists in src.
    case 'task_status_changed_to':
    case 'task_assigned_to':
    case 'task_created_from_template':
    case 'task_approval_rejected':
    case 'task_dependency_resolved':
    case 'project_created':
      return [];
    default:
      return [];
  }
}
