/** Public API for the Operations module. */

export { getOperationsDashboard } from './application/get-operations-dashboard';
export type { OperationsDashboardData } from './application/get-operations-dashboard';
export { getAccessibleWorkspaceIds } from './data/operations.repository';
export type {
  ActiveProjectStats,
  TaskCountStats,
  UpcomingMilestone,
  StaleProject,
  WorkloadEntry,
  RecentActivityEvent,
} from './data/operations.repository';
