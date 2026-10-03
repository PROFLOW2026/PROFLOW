import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import {
  countReportsByDateInWindow,
  deleteEntryRow,
  ensureDailyLogRow,
  findDailyLog,
  findEntry,
  insertEntry,
  insertReport,
  listDailyLogsInWindow,
  listEntriesForLog,
  listInstructionsForDay,
  listReportsForDate,
  nextEntrySortOrder,
  updateDailyLogRow,
  updateEntryRow,
  type DailyLogEntryRow,
  type DailyLogRow,
  type DailyReportRow,
  type InstructionOfDayRow,
} from '../data/site-log.repository';
import { dateWindowDescending, isIsoDate, shiftIsoDate } from '../domain/dates';
import {
  canEditDailyLog,
  entryHasContent,
  latestReportRevisions,
  summarizeDailyLog,
  type DailyLogSummary,
} from '../domain/daily-log';
import {
  listProjectContractors,
  listProjectLocationOptions,
  vendorNameMap,
  type ProjectContractorOption,
  type ProjectLocationOption,
} from '../shared/project-parties';
import { parseOrThrow } from '../shared/validation';
import {
  addDailyLogEntrySchema,
  dailyLogKeySchema,
  recordContractorReportSchema,
  removeDailyLogEntrySchema,
  updateDailyLogEntrySchema,
  updateDailyLogHeaderSchema,
  type AddDailyLogEntryInput,
  type RecordContractorReportInput,
  type UpdateDailyLogEntryInput,
  type UpdateDailyLogHeaderInput,
} from '../validation/schemas';

const C = PROJECT_CAPABILITIES;
const AUDIT_ENTITY = 'site_daily_log';

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface DailyLogCalendarDay {
  readonly logDate: string;
  readonly logId: string | null;
  readonly status: DailyLogRow['status'] | null;
  readonly weather: string | null;
  readonly entryCount: number;
  readonly contractorReports: number;
}

export interface DailyLogCalendar {
  readonly today: string;
  readonly toDate: string;
  readonly days: readonly DailyLogCalendarDay[];
  readonly olderToDate: string;
  readonly newerToDate: string | null;
  readonly canManage: boolean;
}

const WINDOW_DAYS = 14;

/** Date-based calendar of the log: every day of the window, with or without a log row. */
export async function getDailyLogCalendar(
  context: OrgContext,
  projectId: string,
  options: { readonly toDate?: string | null } = {},
): Promise<DailyLogCalendar> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const capabilities = await loadProjectCapabilities(context, projectId);
  const today = todayInTimeZone(context.organization.timezone);
  const requested = options.toDate && isIsoDate(options.toDate) ? options.toDate : today;
  const toDate = requested > today ? today : requested;
  const fromDate = shiftIsoDate(toDate, -(WINDOW_DAYS - 1));

  const [logs, reportCounts] = await Promise.all([
    listDailyLogsInWindow(context.db, context.organizationId, projectId, fromDate, toDate),
    countReportsByDateInWindow(context.db, context.organizationId, projectId, fromDate, toDate),
  ]);
  const byDate = new Map(logs.map((log) => [log.logDate, log]));
  const days = dateWindowDescending(toDate, WINDOW_DAYS).map((logDate) => {
    const log = byDate.get(logDate);
    return {
      logDate,
      logId: log?.id ?? null,
      status: log?.status ?? null,
      weather: log?.weather ?? null,
      entryCount: log?.entryCount ?? 0,
      contractorReports: reportCounts.get(logDate) ?? 0,
    };
  });

  const newer = shiftIsoDate(toDate, WINDOW_DAYS);
  return {
    today,
    toDate,
    days,
    olderToDate: shiftIsoDate(fromDate, -1),
    newerToDate: toDate >= today ? null : newer > today ? today : newer,
    canManage: capabilities.has(C.DAILY_LOG_MANAGE),
  };
}

export interface DailyLogEntryView extends DailyLogEntryRow {
  readonly vendorName: string | null;
}

export interface DailyReportView extends DailyReportRow {
  readonly vendorName: string | null;
  readonly isLatest: boolean;
}

export interface DailyLogDay {
  readonly projectId: string;
  readonly logDate: string;
  readonly today: string;
  readonly previousDate: string;
  readonly nextDate: string | null;
  readonly log: DailyLogRow | null;
  readonly entries: readonly DailyLogEntryView[];
  readonly reports: readonly DailyReportView[];
  readonly instructions: readonly InstructionOfDayRow[];
  readonly summary: DailyLogSummary;
  readonly contractors: readonly ProjectContractorOption[];
  readonly locations: readonly ProjectLocationOption[];
  readonly canManage: boolean;
  readonly canEdit: boolean;
  readonly canSeeInstructions: boolean;
}

export async function getDailyLogDay(context: OrgContext, projectId: string, logDate: string): Promise<DailyLogDay> {
  const key = parseOrThrow(dailyLogKeySchema.safeParse({ projectId, logDate }));
  await assertProjectCapability(context, key.projectId, C.PROJECT_VIEW);
  const capabilities = await loadProjectCapabilities(context, key.projectId);
  const org = context.organizationId;

  const log = await findDailyLog(context.db, org, key.projectId, key.logDate);
  const canSeeInstructions = capabilities.has(C.CONTRACTOR_VIEW);
  const [entries, reports, instructions, contractors, locations] = await Promise.all([
    log ? listEntriesForLog(context.db, org, log.id) : Promise.resolve([] as DailyLogEntryRow[]),
    listReportsForDate(context.db, org, key.projectId, key.logDate),
    canSeeInstructions
      ? listInstructionsForDay(
          context.db,
          org,
          key.projectId,
          key.logDate,
          log?.id ?? null,
          context.organization.timezone,
        )
      : Promise.resolve([] as InstructionOfDayRow[]),
    listProjectContractors(context.db, org, key.projectId),
    listProjectLocationOptions(context.db, org, key.projectId),
  ]);

  const names = await vendorNameMap(context.db, org, [
    ...entries.flatMap((entry) => (entry.vendorId ? [entry.vendorId] : [])),
    ...reports.map((report) => report.vendorId),
    ...instructions.map((instruction) => instruction.vendorId),
  ]);
  const latestIds = new Set(latestReportRevisions(reports).map((report) => report.id));
  const today = todayInTimeZone(context.organization.timezone);
  const canManage = capabilities.has(C.DAILY_LOG_MANAGE);

  return {
    projectId: key.projectId,
    logDate: key.logDate,
    today,
    previousDate: shiftIsoDate(key.logDate, -1),
    nextDate: key.logDate >= today ? null : shiftIsoDate(key.logDate, 1),
    log,
    entries: entries.map((entry) => ({ ...entry, vendorName: entry.vendorId ? names.get(entry.vendorId) ?? null : null })),
    reports: reports.map((report) => ({
      ...report,
      vendorName: names.get(report.vendorId) ?? null,
      isLatest: latestIds.has(report.id),
    })),
    instructions,
    summary: summarizeDailyLog(entries, reports),
    contractors,
    locations,
    canManage,
    canEdit: canManage && canEditDailyLog(log?.status ?? null),
    canSeeInstructions,
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

async function ensureLog(context: OrgContext, projectId: string, logDate: string): Promise<DailyLogRow> {
  const { log, created } = await ensureDailyLogRow(context.db, {
    organizationId: context.organizationId,
    projectId,
    logDate,
    createdByUserId: context.userId,
  });
  if (created) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.SITE_DAILY_LOG_CREATED,
      entityType: AUDIT_ENTITY,
      entityId: log.id,
      after: { projectId, logDate },
    });
  }
  return log;
}

function assertOpen(log: DailyLogRow): void {
  if (!canEditDailyLog(log.status)) {
    throw new DomainRuleError('Daily log is closed', 'siteOps.errors.logClosed');
  }
}

function assertNotFuture(context: OrgContext, logDate: string): void {
  if (logDate > todayInTimeZone(context.organization.timezone)) {
    throw new ValidationError([{ path: 'logDate', message: 'Future dates cannot be logged', messageKey: 'siteOps.errors.futureDate' }]);
  }
}

export async function updateDailyLogHeader(context: OrgContext, raw: UpdateDailyLogHeaderInput): Promise<DailyLogRow> {
  const input = parseOrThrow(updateDailyLogHeaderSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  assertNotFuture(context, input.logDate);
  const log = await ensureLog(context, input.projectId, input.logDate);
  assertOpen(log);
  const updated = await updateDailyLogRow(context.db, context.organizationId, log.id, {
    weather: input.weather ?? null,
    notes: input.notes ?? null,
  });
  if (!updated) throw new NotFoundError('Daily log');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_UPDATED,
    entityType: AUDIT_ENTITY,
    entityId: log.id,
    before: { weather: log.weather, notes: log.notes },
    after: { weather: updated.weather, notes: updated.notes },
  });
  return updated;
}

export async function addDailyLogEntry(context: OrgContext, raw: AddDailyLogEntryInput): Promise<DailyLogEntryRow> {
  const input = parseOrThrow(addDailyLogEntrySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  assertNotFuture(context, input.logDate);
  if (!entryHasContent(input)) {
    throw new ValidationError([{ path: 'description', message: 'Entry is empty', messageKey: 'siteOps.errors.emptyEntry' }]);
  }
  const log = await ensureLog(context, input.projectId, input.logDate);
  assertOpen(log);
  const entry = await insertEntry(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    dailyLogId: log.id,
    entryType: input.entryType,
    vendorId: input.vendorId ?? null,
    subcontractAgreementId: input.vendorId ? input.subcontractAgreementId ?? null : null,
    locationId: input.locationId ?? null,
    description: input.description ?? null,
    headcount: input.headcount ?? null,
    hours: input.hours === null || input.hours === undefined ? null : String(input.hours),
    quantity: input.quantity === null || input.quantity === undefined ? null : String(input.quantity),
    unit: input.unit ?? null,
    sortOrder: await nextEntrySortOrder(context.db, context.organizationId, log.id),
    createdByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_ENTRY_ADDED,
    entityType: AUDIT_ENTITY,
    entityId: log.id,
    after: { entryId: entry.id, entryType: entry.entryType, vendorId: entry.vendorId },
  });
  return entry;
}

export async function updateDailyLogEntry(context: OrgContext, raw: UpdateDailyLogEntryInput): Promise<DailyLogEntryRow> {
  const input = parseOrThrow(updateDailyLogEntrySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  const existing = await findEntry(context.db, context.organizationId, input.entryId);
  if (!existing || existing.projectId !== input.projectId) throw new NotFoundError('Daily log entry');
  if (!entryHasContent(input)) {
    throw new ValidationError([{ path: 'description', message: 'Entry is empty', messageKey: 'siteOps.errors.emptyEntry' }]);
  }
  const updated = await updateEntryRow(context.db, context.organizationId, existing.id, {
    entryType: input.entryType,
    vendorId: input.vendorId ?? null,
    subcontractAgreementId: input.vendorId ? input.subcontractAgreementId ?? null : null,
    locationId: input.locationId ?? null,
    description: input.description ?? null,
    headcount: input.headcount ?? null,
    hours: input.hours === null || input.hours === undefined ? null : String(input.hours),
    quantity: input.quantity === null || input.quantity === undefined ? null : String(input.quantity),
    unit: input.unit ?? null,
  });
  if (!updated) throw new NotFoundError('Daily log entry');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_ENTRY_UPDATED,
    entityType: AUDIT_ENTITY,
    entityId: existing.dailyLogId,
    before: { entryId: existing.id, entryType: existing.entryType, description: existing.description },
    after: { entryId: updated.id, entryType: updated.entryType, description: updated.description },
  });
  return updated;
}

export async function removeDailyLogEntry(
  context: OrgContext,
  raw: { readonly projectId: string; readonly entryId: string },
): Promise<void> {
  const input = parseOrThrow(removeDailyLogEntrySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  const existing = await findEntry(context.db, context.organizationId, input.entryId);
  if (!existing || existing.projectId !== input.projectId) throw new NotFoundError('Daily log entry');
  if (!(await deleteEntryRow(context.db, context.organizationId, existing.id))) {
    throw new NotFoundError('Daily log entry');
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_ENTRY_REMOVED,
    entityType: AUDIT_ENTITY,
    entityId: existing.dailyLogId,
    before: { entryId: existing.id, entryType: existing.entryType, description: existing.description },
  });
}

export async function closeDailyLog(
  context: OrgContext,
  raw: { readonly projectId: string; readonly logDate: string },
): Promise<DailyLogRow> {
  const input = parseOrThrow(dailyLogKeySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  assertNotFuture(context, input.logDate);
  const log = await ensureLog(context, input.projectId, input.logDate);
  assertOpen(log);
  const closed = await updateDailyLogRow(context.db, context.organizationId, log.id, {
    status: 'closed',
    closedAt: new Date(),
    closedByUserId: context.userId,
  });
  if (!closed) throw new NotFoundError('Daily log');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_CLOSED,
    entityType: AUDIT_ENTITY,
    entityId: log.id,
    after: { status: 'closed', logDate: log.logDate },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.FIELD_DAILY_LOG_CLOSED,
    entityType: 'daily_log',
    entityId: log.id,
    actor: internalActor(context.userId),
    payload: { logDate: log.logDate },
  });
  return closed;
}

export async function reopenDailyLog(
  context: OrgContext,
  raw: { readonly projectId: string; readonly logDate: string },
): Promise<DailyLogRow> {
  const input = parseOrThrow(dailyLogKeySchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  const log = await findDailyLog(context.db, context.organizationId, input.projectId, input.logDate);
  if (!log) throw new NotFoundError('Daily log');
  if (log.status !== 'closed') {
    throw new DomainRuleError('Daily log is not closed', 'siteOps.errors.logNotClosed');
  }
  const reopened = await updateDailyLogRow(context.db, context.organizationId, log.id, {
    status: 'open',
    closedAt: null,
    closedByUserId: null,
  });
  if (!reopened) throw new NotFoundError('Daily log');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_LOG_REOPENED,
    entityType: AUDIT_ENTITY,
    entityId: log.id,
    before: { status: 'closed' },
    after: { status: 'open' },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.FIELD_DAILY_LOG_REOPENED,
    entityType: 'daily_log',
    entityId: log.id,
    actor: internalActor(context.userId),
    payload: { logDate: log.logDate },
  });
  return reopened;
}

/** Internal user records a contractor's daily report on its behalf (new immutable revision). */
export async function recordContractorDailyReport(
  context: OrgContext,
  raw: RecordContractorReportInput,
): Promise<DailyReportRow> {
  const input = parseOrThrow(recordContractorReportSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.DAILY_LOG_MANAGE);
  assertNotFuture(context, input.reportDate);
  const report = await insertReport(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
    reportDate: input.reportDate,
    locationId: input.locationId ?? null,
    manpowerCount: input.manpowerCount ?? null,
    workPerformed: input.workPerformed ?? null,
    equipment: input.equipment ?? null,
    deliveries: input.deliveries ?? null,
    delays: input.delays ?? null,
    blockingIssues: input.blockingIssues ?? null,
    safetyNotes: input.safetyNotes ?? null,
    notes: input.notes ?? null,
    submittedActorType: 'internal',
    submittedByUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_DAILY_REPORT_SUBMITTED,
    entityType: 'site_daily_report',
    entityId: report.id,
    after: { vendorId: report.vendorId, reportDate: report.reportDate, revision: report.revision, onBehalf: true },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.FIELD_DAILY_LOG_SUBMITTED,
    entityType: 'site_daily_report',
    entityId: report.id,
    actor: internalActor(context.userId),
    payload: {
      reportDate: report.reportDate,
      vendorId: report.vendorId,
      subcontractAgreementId: report.subcontractAgreementId,
      revision: report.revision,
    },
  });
  return report;
}
