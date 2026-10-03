/**
 * Factual contractor performance metrics (Track Q). Transparent formulas — no AI score.
 * Formula version `q-v1` documents each field below.
 */

export const PERFORMANCE_FORMULA_VERSION = 'q-v1' as const;

export interface PerformanceInputs {
  readonly tasksAssigned: number;
  readonly tasksCompletedOnTime: number;
  readonly defectsReported: number;
  readonly defectsReopened: number;
  readonly rfisAnsweredWithinSla: number;
  readonly rfisTotalAnswered: number;
  readonly inspectionsPassed: number;
  readonly inspectionsTotal: number;
  readonly complianceDocumentsApproved: number;
  readonly complianceDocumentsRequired: number;
}

export interface PerformanceMetrics {
  readonly formulaVersion: typeof PERFORMANCE_FORMULA_VERSION;
  readonly taskTimelinessRate: number | null;
  readonly defectReopenRate: number | null;
  readonly rfiResponseSlaRate: number | null;
  readonly inspectionPassRate: number | null;
  readonly complianceApprovalRate: number | null;
  readonly inputs: PerformanceInputs;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

export function computePerformanceMetrics(inputs: PerformanceInputs): PerformanceMetrics {
  return {
    formulaVersion: PERFORMANCE_FORMULA_VERSION,
    taskTimelinessRate: rate(inputs.tasksCompletedOnTime, inputs.tasksAssigned),
    defectReopenRate: rate(inputs.defectsReopened, inputs.defectsReported),
    rfiResponseSlaRate: rate(inputs.rfisAnsweredWithinSla, inputs.rfisTotalAnswered),
    inspectionPassRate: rate(inputs.inspectionsPassed, inputs.inspectionsTotal),
    complianceApprovalRate: rate(inputs.complianceDocumentsApproved, inputs.complianceDocumentsRequired),
    inputs,
  };
}
