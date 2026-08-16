/** Early-warning product layer - consumes composed financials, never recalculates them. */

export { evaluateEarlyWarnings, highestWarningSeverity } from './domain/evaluate-warnings';
export {
  EARLY_WARNING_KINDS,
  EARLY_WARNING_CLASSES,
  EARLY_WARNING_SEVERITIES,
} from './domain/types';
export type {
  EarlyWarning,
  EarlyWarningClass,
  EarlyWarningDriver,
  EarlyWarningInput,
  EarlyWarningKind,
  EarlyWarningSeverity,
} from './domain/types';

export { getProjectEarlyWarnings } from './application/get-project-warnings';
export { getOrganizationEarlyWarnings } from './application/get-org-warnings';
export { mapFinancialsToWarningInput } from './application/map-financials-to-warning-input';
