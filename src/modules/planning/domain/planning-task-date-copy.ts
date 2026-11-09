/**
 * Manual date copy between a planning row and its linked UWM task (EXL-B3).
 * No background sync — callers apply the mapped patch only on explicit user action.
 */

export interface PlanningRowDates {
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
}

export interface LinkedTaskDates {
  readonly startDate: string | null;
  readonly dueDate: string | null;
}

/** Planning `start_date` / `target_end` → task `start_date` / `due_date`. */
export function mapPlanningDatesToTaskUpdate(
  planning: PlanningRowDates,
): LinkedTaskDates {
  return {
    startDate: planning.startDate,
    dueDate: planning.targetEndDate,
  };
}

/** Task `start_date` / `due_date` → planning `start_date` / `target_end`. */
export function mapTaskDatesToPlanningUpdate(task: LinkedTaskDates): PlanningRowDates {
  return {
    startDate: task.startDate,
    targetEndDate: task.dueDate,
  };
}
