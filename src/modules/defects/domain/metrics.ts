import type { InspectionOutcome } from '@/modules/inspections/domain/rules';
import { isDefectOverdue, type DefectSeverity, type DefectStatus } from './lifecycle';

/** Per-contractor quality metrics (pure). Consumed by Track Q (performance) and Contractor 360. */

export interface MetricsInspectionRow {
  readonly attemptNo: number;
  readonly outcome: InspectionOutcome;
}

export interface MetricsDefectRow {
  readonly status: DefectStatus;
  readonly severity: DefectSeverity;
  readonly cycleNo: number;
  readonly dueDate: string | null;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
}

export interface ContractorQualityMetrics {
  /** Decided inspection attempts (each re-inspection counts). */
  readonly inspectionAttempts: number;
  readonly inspectionsFailedAttempts: number;
  /** Inspections whose first attempt passed (pass or conditional_pass). */
  readonly firstTimePassCount: number;
  /** Inspections with a decided first attempt. */
  readonly firstAttemptCount: number;
  /** 0..1, null when there is no decided first attempt. */
  readonly firstTimePassRate: number | null;
  readonly defectsTotal: number;
  readonly defectsOpen: number;
  readonly defectsOverdue: number;
  readonly defectsCriticalOpen: number;
  readonly defectsClosed: number;
  /** Defects that needed more than one repair cycle. */
  readonly defectsReworked: number;
  /** Mean repair cycles of closed defects, null when none closed. */
  readonly averageRepairCycles: number | null;
  /** Mean days from opening to closing, null when none closed. */
  readonly averageDaysToClose: number | null;
}

const DAY_MS = 86_400_000;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeContractorQualityMetrics(
  outcomes: readonly MetricsInspectionRow[],
  defects: readonly MetricsDefectRow[],
  today: string,
): ContractorQualityMetrics {
  const firstAttempts = outcomes.filter((row) => row.attemptNo === 1);
  const firstTimePassCount = firstAttempts.filter((row) => row.outcome !== 'fail').length;

  let defectsOpen = 0;
  let defectsOverdue = 0;
  let defectsCriticalOpen = 0;
  let defectsReworked = 0;
  const closed: MetricsDefectRow[] = [];
  let considered = 0;
  for (const defect of defects) {
    if (defect.status === 'cancelled') continue;
    considered += 1;
    if (defect.cycleNo > 1) defectsReworked += 1;
    if (defect.status === 'closed') {
      closed.push(defect);
      continue;
    }
    defectsOpen += 1;
    if (defect.severity === 'critical') defectsCriticalOpen += 1;
    if (isDefectOverdue(defect, today)) defectsOverdue += 1;
  }

  const averageRepairCycles =
    closed.length === 0 ? null : round(closed.reduce((sum, row) => sum + row.cycleNo, 0) / closed.length);
  const closedWithDates = closed.filter((row) => row.closedAt);
  const averageDaysToClose =
    closedWithDates.length === 0
      ? null
      : round(
          closedWithDates.reduce(
            (sum, row) => sum + Math.max(0, row.closedAt!.getTime() - row.createdAt.getTime()) / DAY_MS,
            0,
          ) / closedWithDates.length,
          1,
        );

  return {
    inspectionAttempts: outcomes.length,
    inspectionsFailedAttempts: outcomes.filter((row) => row.outcome === 'fail').length,
    firstTimePassCount,
    firstAttemptCount: firstAttempts.length,
    firstTimePassRate: firstAttempts.length === 0 ? null : round(firstTimePassCount / firstAttempts.length, 4),
    defectsTotal: considered,
    defectsOpen,
    defectsOverdue,
    defectsCriticalOpen,
    defectsClosed: closed.length,
    defectsReworked,
    averageRepairCycles,
    averageDaysToClose,
  };
}
