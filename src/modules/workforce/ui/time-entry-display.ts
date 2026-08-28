import type { TimeEntryListItem, TimeApprovalStatus } from '@/modules/workforce/domain/types';
import { DEFAULT_WORK_PACKAGE_NAME } from '@/modules/projects/domain/types';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import {
  dailySummaryKey,
  groupTimeEntriesByDate,
} from '@/modules/workforce/domain/time-entry-list-grouping';
import type { TimeEntryDailySummary } from '@/modules/workforce/application/time-entry-daily-summaries';

export function approvalShape(status: TimeApprovalStatus): 'approved' | 'pending' | 'onHold' | 'draft' {
  if (status === 'approved') return 'approved';
  if (status === 'submitted') return 'pending';
  if (status === 'returned') return 'onHold';
  return 'draft';
}

export function resolveTimeEntryStatusLabel(
  entry: Pick<
    TimeEntryListItem,
    'status' | 'approvalStatus' | 'excessHours' | 'excessApprovalStatus'
  >,
  t: (key: string) => string,
): { readonly primary: string; readonly shape: ReturnType<typeof approvalShape> | 'void' } {
  if (entry.status === 'void') {
    return { primary: t('time.status.void'), shape: 'void' };
  }

  let primary = t(`time.approvalStatus.${entry.approvalStatus}`);
  if (
    entry.excessHours &&
    Number(entry.excessHours) > 0 &&
    entry.excessApprovalStatus === 'pending'
  ) {
    primary = t('time.mobile.excessPendingStatus');
  } else if (
    entry.excessHours &&
    Number(entry.excessHours) > 0 &&
    entry.excessApprovalStatus === 'approved'
  ) {
    primary = t('time.mobile.excessApprovedStatus');
  }

  return { primary, shape: approvalShape(entry.approvalStatus) };
}

export function formatWorkPackageDisplayName(
  workPackageName: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!workPackageName) return null;
  if (workPackageName === DEFAULT_WORK_PACKAGE_NAME) {
    return t('time.defaultWorkPackageName');
  }
  return workPackageName;
}

export function entryTargetLine(
  entry: TimeEntryListItem,
  t: (key: string, values?: Record<string, string>) => string,
  options: { readonly projectScoped: boolean },
): string | null {
  const workPackageLabel = formatWorkPackageDisplayName(entry.workPackageName, t);

  if (options.projectScoped && entry.kind === 'project') {
    return workPackageLabel;
  }

  const primary =
    entry.kind === 'project'
      ? entry.projectName ?? t('time.unknownProject')
      : entry.timeCodeName ?? t('time.nonProject');

  return workPackageLabel ? `${primary} · ${workPackageLabel}` : primary;
}

export function formatHoursWithUnit(
  hours: string | number | null | undefined,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  return t('time.mobile.hoursLine', { hours: formatWorkHoursValue(hours) });
}

export { groupTimeEntriesByDate, dailySummaryKey };

export type { TimeEntryDailySummary };
