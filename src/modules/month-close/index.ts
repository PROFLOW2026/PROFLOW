/** Public API — operational month close (optional module). */

export type {
  CompletenessCheckItem,
  CompletenessCheckKey,
  CompletenessSnapshot,
  MonthCloseAdjustment,
  MonthCloseAdjustmentType,
  MonthCloseEffectSide,
  MonthClosePeriod,
  MonthCloseProjectOption,
  MonthCloseStatus,
} from './domain/types';

export {
  COMPLETENESS_CHECK_KEYS,
  MONTH_CLOSE_ADJUSTMENT_TYPES,
  MONTH_CLOSE_EFFECT_SIDES,
  MONTH_CLOSE_STATUSES,
} from './domain/types';

export {
  explainMonthCloseAdjustments,
  isAdjustmentSuperseded,
  isEconomicAdjustment,
  netEconomicAdjustments,
  supersededAdjustmentIds,
} from './domain/economic-corrections';
export type {
  EconomicAdjustmentLike,
  MonthCloseAdjustmentExplanation,
} from './domain/economic-corrections';

export {
  buildCompletenessItems,
  formatCompletenessPercent,
  isCompletenessReady,
  scoreCompleteness,
} from './domain/completeness';
export type { CompletenessCheckInput } from './domain/completeness';

export {
  CLOSED_PERIOD_FREEZE_CODE,
  assertCanTransitionMonthClose,
  assertPeriodClosed,
  assertPeriodNotClosed,
  canTransitionMonthClose,
  closedPeriodSourceRewriteError,
  isClosedPeriodFreezeError,
  rethrowClosedPeriodRewrite,
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
  createClosedPeriodSourceCorrection,
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
