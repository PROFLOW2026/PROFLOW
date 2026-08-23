/**
 * Compatibility re-exports — canonical implementation lives in
 * `financial-slice-availability.ts` (R-005 / R-007).
 */
export {
  buildSliceAvailability,
  resolveProjectFinancialKpiAvailability,
  resolveProjectFinancialKpiAvailability as resolveProjectKpiAvailability,
  type FinancialSliceAvailability,
  type FinancialSliceLoadState,
  type ProjectFinancialKpiAvailability,
  type ProjectKpiAvailability,
} from './financial-slice-availability';
