/**
 * UI entry for planning — keep React out of `index.ts`.
 * Lead wires project tab / nav later; export panel for composition.
 */

export { ProjectPlanningPanel } from './ui/project-planning-panel';
export type { ProjectPlanningPanelProps } from './ui/project-planning-panel';
export { ProjectSchedulePanel } from './ui/project-schedule-panel';
export type { ProjectSchedulePanelProps } from './ui/project-schedule-panel';
export { GanttChart } from './ui/gantt-chart';
export type { GanttChartProps } from './ui/gantt-chart';
export {
  planningMessages,
  formatPlanningMessage,
  type PlanningLocale,
  type PlanningMessages,
} from './ui/messages';
