// Evaluated before inbox collectors. Domain tracks import this barrel from their
// register-ports modules, and those modules are loaded by the collectors.
export { registerDgCommandCenterPort } from './data/dg-ports';
export type { DgCommandCenterQuery, DgCommandCenterQueryInput } from './data/dg-ports';

export { getTodayInbox } from './application/get-today-inbox';
export { latestCompletedMonth } from './data/collect-monthly-workforce-report';
export { getActionableInbox, getActionableInboxIfAllowed } from './application/get-actionable-inbox';
export { updateCommandCenterItemState } from './application/update-item-state';

export {
  COMMAND_CENTER_SOURCE_TYPES,
  COMMAND_CENTER_SEVERITIES,
  COMMAND_CENTER_ITEM_STATES,
  FINANCIAL_SOURCE_TYPES,
  isFinancialSourceType,
} from './domain/types';
export type {
  CommandCenterSourceType,
  CommandCenterSeverity,
  CommandCenterItemState,
  CommandCenterItem,
  CommandCenterInbox,
  FinancialSourceType,
} from './domain/types';

export { dedupeCommandCenterItems } from './domain/dedupe-command-center-items';

export {
  buildItemKey,
  computeRankScore,
  compareCommandCenterItems,
  sortCommandCenterItems,
  withItemDefaults,
  assertSafeItemStateTransition,
  SOURCE_DEFAULT_SEVERITY,
  groupInboxBySeverity,
  groupInboxForToday,
} from './domain/ranking';

export {
  updateCommandCenterItemStateSchema,
} from './validation/schemas';

/** Developer / GC sources: domain tracks register their actionable-item queries here. */
export { DG_SOURCE_TYPES } from './domain/types';
export type { DgSourceType } from './domain/types';
export { DG_ITEM_DEFINITIONS, buildDgItems } from './domain/dg-items';
export type { DgCommandCenterRow, DgItemDefinition } from './domain/dg-items';
export type { UpdateCommandCenterItemStateInput } from './validation/schemas';
