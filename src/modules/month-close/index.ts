/** Public API — operational month close (optional module). */

export type {
  CompletenessCheckItem,
  CompletenessCheckKey,
  CompletenessSnapshot,
  MonthCloseAdjustment,
  MonthCloseAdjustmentType,
  MonthClosePeriod,
  MonthCloseStatus,
} from './domain/types';

export {
  COMPLETENESS_CHECK_KEYS,
  MONTH_CLOSE_ADJUSTMENT_TYPES,
  MONTH_CLOSE_STATUSES,
} from './domain/types';

export {
  buildCompletenessItems,
  formatCompletenessPercent,
  isCompletenessReady,
  scoreCompleteness,
} from './domain/completeness';
export type { CompletenessCheckInput } from './domain/completeness';

export {
  assertCanTransitionMonthClose,
  assertPeriodClosed,
  assertPeriodNotClosed,
  canTransitionMonthClose,
  statusShape,
} from './domain/period-state';

export {
  assertYearMonth,
  currentYearMonth,
  isYearMonth,
  yearMonthBounds,
  yearMonthFromBusinessDate,
} from './domain/year-month';

export {
  assertMonthOpenForRewrite,
  closeMonthClosePeriod,
  createMonthCloseAdjustment,
  demoteMonthCloseToOpen,
  ensureMonthClosePeriod,
  getMonthClosePeriodDetail,
  isMonthClosed,
  listMonthCloseWorkspace,
  markMonthCloseReady,
  refreshPeriodCompleteness,
} from './application/manage-periods';

export {
  closePeriodSchema,
  createAdjustmentSchema,
  demoteToOpenSchema,
  ensurePeriodSchema,
  listPeriodsSchema,
  markReadySchema,
} from './validation/schemas';
