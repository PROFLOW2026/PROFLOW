import { PROJECT_CAPABILITIES as C, type ProjectCapability } from '@/modules/project-team/domain/capabilities';
import { isDeveloperGcMode } from '@/modules/project-profile/domain/management-mode';
import type { DeliveryProfile } from '@/modules/project-profile/domain/profile';

/** The seven Developer / GC hubs. Labels live in `projectWorkspace.execution.hubs`. */
export const EXECUTION_HUB_KEYS = [
  'overview',
  'contractors',
  'contracts',
  'payments',
  'planning',
  'quality',
  'team',
] as const;

export type ExecutionHubKey = (typeof EXECUTION_HUB_KEYS)[number];

export interface ExecutionHubDefinition {
  readonly key: ExecutionHubKey;
  readonly path: string;
  readonly anyOf: readonly ProjectCapability[];
}

export const EXECUTION_HUBS: readonly ExecutionHubDefinition[] = [
  { key: 'overview', path: 'execution', anyOf: [C.PROJECT_VIEW] },
  { key: 'contractors', path: 'contractors', anyOf: [C.CONTRACTOR_VIEW] },
  {
    key: 'contracts',
    path: 'execution-contracts',
    anyOf: [C.CONTRACTOR_VIEW, C.CONTRACT_FINANCIAL_VIEW, C.CONTRACT_MANAGE],
  },
  {
    key: 'payments',
    path: 'contractor-payments',
    anyOf: [C.CLAIM_VIEW, C.PAYMENT_VIEW, C.DEDUCTIONS_MANAGE, C.RETENTION_MANAGE, C.PROJECT_BUDGET_VIEW],
  },
  {
    key: 'planning',
    path: 'execution-planning',
    anyOf: [C.SCHEDULE_VIEW, C.SCHEDULE_MANAGE, C.TASKS_VIEW, C.CONTRACTOR_COORDINATE],
  },
  {
    key: 'quality',
    path: 'execution-quality',
    anyOf: [
      C.DOCUMENTS_VIEW,
      C.RFI_MANAGE,
      C.SUBMITTAL_MANAGE,
      C.QUALITY_MANAGE,
      C.DEFECTS_MANAGE,
      C.DAILY_LOG_MANAGE,
      C.MEETINGS_MANAGE,
      C.SAFETY_MANAGE,
    ],
  },
  { key: 'team', path: 'team', anyOf: [C.PROJECT_VIEW] },
];

export interface ExecutionHubLink {
  readonly key: ExecutionHubKey;
  readonly href: string;
}

export interface ExecutionHubChildLink {
  readonly id: string;
  readonly hub: ExecutionHubKey;
  readonly path: string;
  /** Employee segment when it differs from the owner path. */
  readonly employeePath?: string;
  readonly anyOf: readonly ProjectCapability[];
  /** `projectWorkspace.execution.hubLinks.<labelKey>` */
  readonly labelKey: string;
  /** `projectWorkspace.execution.hubGroups.<groupKey>` */
  readonly groupKey: string;
}

/**
 * Child routes inside a hub. Planning never uses `?tab=schedule`.
 * That query stays the classic work-hub schedule on non-GC projects.
 */
export const EXECUTION_HUB_CHILDREN: readonly ExecutionHubChildLink[] = [
  {
    id: 'contracts-register',
    hub: 'contracts',
    path: 'contractors',
    anyOf: [C.CONTRACTOR_VIEW, C.CONTRACT_MANAGE],
    labelKey: 'agreementRegister',
    groupKey: 'contracts',
  },
  {
    id: 'contracts-unpriced',
    hub: 'contracts',
    path: 'unpriced-work',
    anyOf: [C.CONTRACTOR_VIEW, C.CONTRACT_MANAGE],
    labelKey: 'unpricedWork',
    groupKey: 'contracts',
  },
  {
    id: 'payments-claims',
    hub: 'payments',
    path: 'claims',
    anyOf: [C.CLAIM_VIEW],
    labelKey: 'claims',
    groupKey: 'payments',
  },
  {
    id: 'payments-deductions',
    hub: 'payments',
    path: 'deductions',
    anyOf: [C.DEDUCTIONS_MANAGE, C.CLAIM_VIEW],
    labelKey: 'deductions',
    groupKey: 'payments',
  },
  {
    id: 'payments-cost',
    hub: 'payments',
    path: 'cost-control',
    anyOf: [C.PROJECT_BUDGET_VIEW, C.PAYMENT_VIEW],
    labelKey: 'costControl',
    groupKey: 'payments',
  },
  {
    id: 'planning-coordination',
    hub: 'planning',
    path: 'coordination',
    anyOf: [C.SCHEDULE_VIEW, C.SCHEDULE_MANAGE, C.CONTRACTOR_COORDINATE],
    labelKey: 'coordination',
    groupKey: 'planning',
  },
  {
    id: 'planning-tasks',
    hub: 'planning',
    path: 'tasks',
    anyOf: [C.TASKS_VIEW, C.TASKS_MANAGE],
    labelKey: 'tasks',
    groupKey: 'planning',
  },
  {
    id: 'planning-board',
    hub: 'planning',
    path: 'boards',
    employeePath: 'board',
    anyOf: [C.TASKS_VIEW, C.TASKS_MANAGE],
    labelKey: 'board',
    groupKey: 'planning',
  },
  {
    id: 'planning-calendar',
    hub: 'planning',
    path: 'calendar',
    anyOf: [C.SCHEDULE_VIEW, C.SCHEDULE_MANAGE, C.TASKS_VIEW],
    labelKey: 'calendar',
    groupKey: 'planning',
  },
  {
    id: 'planning-timeline',
    hub: 'planning',
    path: 'timeline',
    anyOf: [C.SCHEDULE_VIEW, C.SCHEDULE_MANAGE],
    labelKey: 'timeline',
    groupKey: 'planning',
  },
  {
    id: 'planning-instructions',
    hub: 'planning',
    path: 'instructions',
    anyOf: [C.CONTRACTOR_COORDINATE],
    labelKey: 'instructions',
    groupKey: 'planning',
  },
  {
    id: 'quality-plans',
    hub: 'quality',
    path: 'plans',
    anyOf: [C.DOCUMENTS_VIEW],
    labelKey: 'plans',
    groupKey: 'documents',
  },
  {
    id: 'quality-rfi',
    hub: 'quality',
    path: 'rfi',
    anyOf: [C.RFI_MANAGE, C.DOCUMENTS_VIEW],
    labelKey: 'rfi',
    groupKey: 'documents',
  },
  {
    id: 'quality-submittals',
    hub: 'quality',
    path: 'submittals',
    anyOf: [C.SUBMITTAL_MANAGE, C.DOCUMENTS_VIEW],
    labelKey: 'submittals',
    groupKey: 'documents',
  },
  {
    id: 'quality-inspections',
    hub: 'quality',
    path: 'inspections',
    anyOf: [C.QUALITY_MANAGE],
    labelKey: 'inspections',
    groupKey: 'quality',
  },
  {
    id: 'quality-defects',
    hub: 'quality',
    path: 'defects',
    anyOf: [C.DEFECTS_MANAGE, C.QUALITY_MANAGE],
    labelKey: 'defects',
    groupKey: 'quality',
  },
  {
    id: 'quality-log',
    hub: 'quality',
    path: 'site-log',
    anyOf: [C.DAILY_LOG_MANAGE],
    labelKey: 'siteLog',
    groupKey: 'site',
  },
  {
    id: 'quality-meetings',
    hub: 'quality',
    path: 'site-meetings',
    anyOf: [C.MEETINGS_MANAGE],
    labelKey: 'meetings',
    groupKey: 'site',
  },
  {
    id: 'quality-instructions',
    hub: 'quality',
    path: 'instructions',
    anyOf: [C.CONTRACTOR_COORDINATE, C.QUALITY_MANAGE],
    labelKey: 'instructions',
    groupKey: 'site',
  },
  {
    id: 'quality-safety',
    hub: 'quality',
    path: 'site-safety',
    anyOf: [C.SAFETY_MANAGE],
    labelKey: 'safety',
    groupKey: 'site',
  },
  {
    id: 'quality-compliance',
    hub: 'quality',
    path: 'contractor-compliance',
    anyOf: [C.CONTRACTOR_VIEW, C.SAFETY_MANAGE],
    labelKey: 'compliance',
    groupKey: 'site',
  },
  {
    id: 'quality-deliveries',
    hub: 'quality',
    path: 'deliveries',
    anyOf: [C.DOCUMENTS_VIEW, C.CONTRACTOR_VIEW],
    labelKey: 'deliveries',
    groupKey: 'site',
  },
  {
    id: 'quality-closeout',
    hub: 'quality',
    path: 'contractor-closeout',
    anyOf: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
    labelKey: 'closeout',
    groupKey: 'closeout',
  },
  {
    id: 'quality-warranty',
    hub: 'quality',
    path: 'contractor-warranty',
    anyOf: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
    labelKey: 'warranty',
    groupKey: 'closeout',
  },
];

const EMPLOYEE_HUB_PATHS = new Set([
  'execution',
  'contractors',
  'execution-contracts',
  'contractor-payments',
  'execution-planning',
  'execution-quality',
  'team',
  'unpriced-work',
  'claims',
  'deductions',
  'cost-control',
  'coordination',
  'tasks',
  'board',
  'calendar',
  'plans',
  'files',
  'rfi',
  'submittals',
  'inspections',
  'defects',
  'site-log',
  'site-meetings',
  'instructions',
  'site-safety',
  'contractor-compliance',
  'deliveries',
  'contractor-closeout',
  'contractor-warranty',
]);

function holdsAny(held: ReadonlySet<ProjectCapability>, anyOf: readonly ProjectCapability[]): boolean {
  return anyOf.some((capability) => held.has(capability));
}

export function selectExecutionHubs(input: {
  readonly projectId: string;
  readonly capabilities: ReadonlySet<ProjectCapability>;
  readonly deliveryProfile: Pick<DeliveryProfile, 'operatingRoles'> | null;
  readonly surfaceRoot?: string;
}): ExecutionHubLink[] {
  if (!isDeveloperGcMode(input.deliveryProfile)) return [];
  const root = input.surfaceRoot ?? `/projects/${input.projectId}`;
  const employee = root.startsWith('/employee/');
  return EXECUTION_HUBS.flatMap((hub) => {
    if (!holdsAny(input.capabilities, hub.anyOf)) return [];
    if (employee && !EMPLOYEE_HUB_PATHS.has(hub.path)) return [];
    return [{ key: hub.key, href: `${root}/${hub.path}` }];
  });
}

export function selectExecutionHubChildren(input: {
  readonly hub: ExecutionHubKey;
  readonly projectId: string;
  readonly capabilities: ReadonlySet<ProjectCapability>;
  readonly surfaceRoot?: string;
}): Array<ExecutionHubChildLink & { readonly href: string }> {
  const root = input.surfaceRoot ?? `/projects/${input.projectId}`;
  const employee = root.startsWith('/employee/');
  return EXECUTION_HUB_CHILDREN.flatMap((child) => {
    if (child.hub !== input.hub) return [];
    if (!holdsAny(input.capabilities, child.anyOf)) return [];
    const segment = employee ? (child.employeePath ?? child.path) : child.path;
    if (employee && !EMPLOYEE_HUB_PATHS.has(segment)) return [];
    if (employee && child.path === 'timeline') return [];
    return [{ ...child, href: `${root}/${segment}` }];
  });
}
