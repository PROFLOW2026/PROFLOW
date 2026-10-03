import {
  SITE_DAILY_LOG_ENTRY_TYPES,
  type SiteDailyLogEntryType,
  type SiteDailyLogStatus,
} from '@drizzle/schema';

/** Daily site log domain (framework-free). No field of a log is mandatory. */

export { SITE_DAILY_LOG_ENTRY_TYPES, type SiteDailyLogEntryType, type SiteDailyLogStatus };

export interface DailyLogEntryContent {
  readonly vendorId?: string | null;
  readonly description?: string | null;
  readonly headcount?: number | null;
  readonly hours?: number | string | null;
  readonly quantity?: number | string | null;
}

/** An entry carries something worth keeping (a contractor, a text, or a number). */
export function entryHasContent(entry: DailyLogEntryContent): boolean {
  if (entry.vendorId) return true;
  if (entry.description && entry.description.trim().length > 0) return true;
  return [entry.headcount, entry.hours, entry.quantity].some(
    (value) => value !== null && value !== undefined && value !== '',
  );
}

export function canEditDailyLog(status: SiteDailyLogStatus | null): boolean {
  return status === null || status === 'open';
}

export interface DailyReportRevisionKey {
  readonly id: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly revision: number;
}

/** Latest revision per contractor party (vendor + agreement); older revisions stay as history. */
export function latestReportRevisions<T extends DailyReportRevisionKey>(reports: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const report of reports) {
    const key = `${report.vendorId}:${report.subcontractAgreementId ?? ''}`;
    const current = latest.get(key);
    if (!current || report.revision > current.revision) latest.set(key, report);
  }
  return [...latest.values()];
}

export interface DailyLogSummaryEntry {
  readonly entryType: SiteDailyLogEntryType;
  readonly vendorId: string | null;
  readonly headcount: number | null;
}

export interface DailyLogSummaryReport extends DailyReportRevisionKey {
  readonly manpowerCount: number | null;
  readonly blockingIssues: string | null;
  readonly delays: string | null;
}

export interface DailyLogSummary {
  readonly contractorsPresent: number;
  /** Internal headcount (manpower + contractor presence entries). */
  readonly recordedManpower: number;
  /** Manpower declared in the latest contractor reports. */
  readonly reportedManpower: number;
  readonly delays: number;
  readonly blockingIssues: number;
  readonly safetyEvents: number;
  readonly inspections: number;
  readonly contractorReports: number;
}

export function summarizeDailyLog(
  entries: readonly DailyLogSummaryEntry[],
  reports: readonly DailyLogSummaryReport[],
): DailyLogSummary {
  const latest = latestReportRevisions(reports);
  const present = new Set<string>();
  let recordedManpower = 0;
  let delays = 0;
  let blockingIssues = 0;
  let safetyEvents = 0;
  let inspections = 0;

  for (const entry of entries) {
    if ((entry.entryType === 'contractor_presence' || entry.entryType === 'manpower') && entry.headcount) {
      recordedManpower += entry.headcount;
    }
    if (entry.entryType === 'contractor_presence' && entry.vendorId) present.add(entry.vendorId);
    if (entry.entryType === 'delay') delays += 1;
    if (entry.entryType === 'blocking_issue') blockingIssues += 1;
    if (entry.entryType === 'safety_event') safetyEvents += 1;
    if (entry.entryType === 'inspection') inspections += 1;
  }

  let reportedManpower = 0;
  for (const report of latest) {
    present.add(report.vendorId);
    reportedManpower += report.manpowerCount ?? 0;
    if (report.delays && report.delays.trim()) delays += 1;
    if (report.blockingIssues && report.blockingIssues.trim()) blockingIssues += 1;
  }

  return {
    contractorsPresent: present.size,
    recordedManpower,
    reportedManpower,
    delays,
    blockingIssues,
    safetyEvents,
    inspections,
    contractorReports: latest.length,
  };
}
