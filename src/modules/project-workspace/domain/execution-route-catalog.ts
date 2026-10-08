import { PROJECT_CAPABILITIES, type ProjectCapability } from '@/modules/project-team/domain/capabilities';

/** Stable keys for the Execution / ביצוע nav (Track S). */
export type ExecutionNavLinkKey =
  | 'structure'
  | 'team'
  | 'contractorAccess'
  | 'contractors'
  | 'schedule'
  | 'tasks'
  | 'coordination'
  | 'plans'
  | 'rfi'
  | 'submittals'
  | 'inspections'
  | 'defects'
  | 'siteLog'
  | 'siteMeetings'
  | 'instructions'
  | 'contractorCompliance'
  | 'siteSafety'
  | 'deliveries'
  | 'tenders'
  | 'contractorCloseout'
  | 'contractorWarranty'
  | 'claims'
  | 'deductions'
  | 'activity'
  | 'unpricedWork'
  | 'costControl'
  | 'executionDashboard';

export type ExecutionNavLabelRef =
  | { readonly namespace: 'projectProfile'; readonly key: 'page.title' }
  | { readonly namespace: 'projectTeam'; readonly key: 'page.title' }
  | { readonly namespace: 'contractorAccess'; readonly key: 'manage.title' }
  | { readonly namespace: 'vendors'; readonly key: 'subcontracts.sectionTitle' }
  | { readonly namespace: 'projectWorkspace'; readonly key: 'execution.schedule' }
  | { readonly namespace: 'projectWorkspace'; readonly key: 'execution.tasks' }
  | { readonly namespace: 'coordination'; readonly key: 'list.pageTitle' }
  | { readonly namespace: 'projectPlans'; readonly key: 'register.pageTitle' }
  | { readonly namespace: 'rfi'; readonly key: 'title' }
  | { readonly namespace: 'submittals'; readonly key: 'title' }
  | { readonly namespace: 'inspections'; readonly key: 'title' }
  | { readonly namespace: 'defects'; readonly key: 'title' }
  | { readonly namespace: 'siteOps'; readonly key: 'siteLog.title' }
  | { readonly namespace: 'siteOps'; readonly key: 'meetings.title' }
  | { readonly namespace: 'siteOps'; readonly key: 'instructions.title' }
  | { readonly namespace: 'contractorCompliance'; readonly key: 'title' }
  | { readonly namespace: 'contractorCompliance'; readonly key: 'safety.title' }
  | { readonly namespace: 'deliveries'; readonly key: 'title' }
  | { readonly namespace: 'awards'; readonly key: 'title' }
  | { readonly namespace: 'handover'; readonly key: 'closeout.title' }
  | { readonly namespace: 'handover'; readonly key: 'warranty.title' }
  | { readonly namespace: 'subcontractClaims'; readonly key: 'list.pageTitle' }
  | { readonly namespace: 'subcontractClaims'; readonly key: 'deductions.pageTitle' }
  | { readonly namespace: 'collaboration'; readonly key: 'activity.pageTitle' }
  | { readonly namespace: 'subcontracts'; readonly key: 'unpriced.pageTitle' }
  | { readonly namespace: 'projectWorkspace'; readonly key: 'execution.costControl' }
  | { readonly namespace: 'projectWorkspace'; readonly key: 'execution.dashboard' };

export interface ExecutionRouteDefinition {
  readonly key: ExecutionNavLinkKey;
  /** Path segment(s) after `/projects/{projectId}/`. */
  readonly path: string;
  readonly pageExists: boolean;
  readonly required: ProjectCapability | readonly ProjectCapability[];
  readonly mode?: 'all' | 'any';
  readonly label: ExecutionNavLabelRef;
}

/**
 * Registered owner routes are treated as mounted. Navigation must not probe
 * `page.tsx` on the serverless filesystem.
 */
function projectRoutePageExists(..._segments: string[]): boolean {
  return true;
}

const EMPLOYEE_EXECUTION_PATHS = new Set([
  'structure',
  'team',
  'contractors',
  'tasks',
  'coordination',
  'plans',
  'rfi',
  'submittals',
  'inspections',
  'defects',
  'site-log',
  'site-meetings',
  'instructions',
  'contractor-compliance',
  'site-safety',
  'deliveries',
  'tenders',
  'contractor-closeout',
  'contractor-warranty',
  'claims',
  'deductions',
  'activity',
  'unpriced-work',
  'cost-control',
  'execution',
  'calendar',
  'files',
  'board',
  'execution-contracts',
  'contractor-payments',
  'execution-planning',
  'execution-quality',
]);

/** True when the Employee app has a page for this execution route segment. */
export function employeeExecutionPageExists(path: string): boolean {
  return EMPLOYEE_EXECUTION_PATHS.has(path);
}

const C = PROJECT_CAPABILITIES;

/** Frozen route table aligned with Track brief §2; `pageExists` reflects the repo at build time. */
export const EXECUTION_ROUTE_CATALOG: readonly ExecutionRouteDefinition[] = [
  {
    key: 'structure',
    path: 'structure',
    pageExists: projectRoutePageExists('structure'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'projectProfile', key: 'page.title' },
  },
  {
    key: 'team',
    path: 'team',
    pageExists: projectRoutePageExists('team'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'projectTeam', key: 'page.title' },
  },
  {
    key: 'contractorAccess',
    path: 'contractor-access',
    pageExists: projectRoutePageExists('contractor-access'),
    required: [C.CONTRACTOR_INVITE, C.EXTERNAL_ACCESS_MANAGE],
    mode: 'any',
    label: { namespace: 'contractorAccess', key: 'manage.title' },
  },
  {
    key: 'contractors',
    path: 'contractors',
    pageExists: projectRoutePageExists('contractors'),
    required: C.CONTRACTOR_VIEW,
    label: { namespace: 'vendors', key: 'subcontracts.sectionTitle' },
  },
  {
    key: 'schedule',
    path: '?tab=schedule',
    pageExists: true,
    required: C.SCHEDULE_VIEW,
    label: { namespace: 'projectWorkspace', key: 'execution.schedule' },
  },
  {
    key: 'tasks',
    path: 'tasks',
    pageExists: projectRoutePageExists('tasks'),
    required: C.TASKS_VIEW,
    label: { namespace: 'projectWorkspace', key: 'execution.tasks' },
  },
  {
    key: 'coordination',
    path: 'coordination',
    pageExists: projectRoutePageExists('coordination'),
    required: [C.SCHEDULE_VIEW, C.CONTRACTOR_COORDINATE],
    mode: 'any',
    label: { namespace: 'coordination', key: 'list.pageTitle' },
  },
  {
    key: 'plans',
    path: 'plans',
    pageExists: projectRoutePageExists('plans'),
    required: C.DOCUMENTS_VIEW,
    label: { namespace: 'projectPlans', key: 'register.pageTitle' },
  },
  {
    key: 'rfi',
    path: 'rfi',
    pageExists: projectRoutePageExists('rfi'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'rfi', key: 'title' },
  },
  {
    key: 'submittals',
    path: 'submittals',
    pageExists: projectRoutePageExists('submittals'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'submittals', key: 'title' },
  },
  {
    key: 'inspections',
    path: 'inspections',
    pageExists: projectRoutePageExists('inspections'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'inspections', key: 'title' },
  },
  {
    key: 'defects',
    path: 'defects',
    pageExists: projectRoutePageExists('defects'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'defects', key: 'title' },
  },
  {
    key: 'siteLog',
    path: 'site-log',
    pageExists: projectRoutePageExists('site-log'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'siteOps', key: 'siteLog.title' },
  },
  {
    key: 'siteMeetings',
    path: 'site-meetings',
    pageExists: projectRoutePageExists('site-meetings'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'siteOps', key: 'meetings.title' },
  },
  {
    key: 'instructions',
    path: 'instructions',
    pageExists: projectRoutePageExists('instructions'),
    required: C.CONTRACTOR_VIEW,
    label: { namespace: 'siteOps', key: 'instructions.title' },
  },
  {
    key: 'contractorCompliance',
    path: 'contractor-compliance',
    pageExists: projectRoutePageExists('contractor-compliance'),
    required: C.CONTRACTOR_VIEW,
    label: { namespace: 'contractorCompliance', key: 'title' },
  },
  {
    key: 'siteSafety',
    path: 'site-safety',
    pageExists: projectRoutePageExists('site-safety'),
    required: C.SAFETY_MANAGE,
    label: { namespace: 'contractorCompliance', key: 'safety.title' },
  },
  {
    key: 'deliveries',
    path: 'deliveries',
    pageExists: projectRoutePageExists('deliveries'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'deliveries', key: 'title' },
  },
  {
    key: 'tenders',
    path: 'tenders',
    pageExists: projectRoutePageExists('tenders'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'awards', key: 'title' },
  },
  {
    key: 'contractorCloseout',
    path: 'contractor-closeout',
    pageExists: projectRoutePageExists('contractor-closeout'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'handover', key: 'closeout.title' },
  },
  {
    key: 'contractorWarranty',
    path: 'contractor-warranty',
    pageExists: projectRoutePageExists('contractor-warranty'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'handover', key: 'warranty.title' },
  },
  {
    key: 'claims',
    path: 'claims',
    pageExists: projectRoutePageExists('claims'),
    required: C.CLAIM_VIEW,
    label: { namespace: 'subcontractClaims', key: 'list.pageTitle' },
  },
  {
    key: 'deductions',
    path: 'deductions',
    pageExists: projectRoutePageExists('deductions'),
    required: C.CLAIM_VIEW,
    label: { namespace: 'subcontractClaims', key: 'deductions.pageTitle' },
  },
  {
    key: 'activity',
    path: 'activity',
    pageExists: projectRoutePageExists('activity'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'collaboration', key: 'activity.pageTitle' },
  },
  {
    key: 'unpricedWork',
    path: 'unpriced-work',
    pageExists: projectRoutePageExists('unpriced-work'),
    required: C.CONTRACTOR_VIEW,
    label: { namespace: 'subcontracts', key: 'unpriced.pageTitle' },
  },
  {
    key: 'costControl',
    path: 'cost-control',
    pageExists: projectRoutePageExists('cost-control'),
    required: C.PROJECT_BUDGET_VIEW,
    label: { namespace: 'projectWorkspace', key: 'execution.costControl' },
  },
  {
    key: 'executionDashboard',
    path: 'execution',
    pageExists: projectRoutePageExists('execution'),
    required: C.PROJECT_VIEW,
    label: { namespace: 'projectWorkspace', key: 'execution.dashboard' },
  },
] as const;

export const EXECUTION_NAV_PRIORITY: readonly ExecutionNavLinkKey[] = EXECUTION_ROUTE_CATALOG.map(
  (route) => route.key,
);
