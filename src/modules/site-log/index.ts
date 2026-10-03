/** Public API for the daily site log (Track O). */

export {
  SITE_DAILY_LOG_ENTRY_TYPES,
  canEditDailyLog,
  entryHasContent,
  latestReportRevisions,
  summarizeDailyLog,
  type DailyLogSummary,
  type SiteDailyLogEntryType,
  type SiteDailyLogStatus,
} from './domain/daily-log';
export { dateWindowDescending, isIsoDate, shiftIsoDate } from './domain/dates';
export {
  addDailyLogEntry,
  closeDailyLog,
  getDailyLogCalendar,
  getDailyLogDay,
  recordContractorDailyReport,
  removeDailyLogEntry,
  reopenDailyLog,
  updateDailyLogEntry,
  updateDailyLogHeader,
  type DailyLogCalendar,
  type DailyLogCalendarDay,
  type DailyLogDay,
  type DailyLogEntryView,
  type DailyReportView,
} from './application/daily-log';
export {
  getContractorDailyReports,
  submitContractorDailyReport,
  type ContractorDailyReportsView,
} from './application/contractor-reports';
export type { ExternalProjectTarget } from './shared/external-scope';
export { findDailyLog } from './data/site-log.repository';
