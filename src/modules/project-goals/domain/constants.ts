export const PROJECT_GOAL_STATUSES = [
  'not_started',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type ProjectGoalStatus = (typeof PROJECT_GOAL_STATUSES)[number];

export const PROJECT_GOAL_PROGRESS_MIN = 0;
export const PROJECT_GOAL_PROGRESS_MAX = 100;
