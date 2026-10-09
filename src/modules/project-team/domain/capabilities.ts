/**
 * Project-scoped capability catalog (Developer / GC layer).
 *
 * A capability is granted to one person on ONE project. It is deliberately a
 * different vocabulary from the organization-wide permission catalog
 * (`src/shared/permissions/catalog.ts`): org permissions answer "may this role
 * do X anywhere", capabilities answer "may this person do X on this project".
 *
 * Financial capabilities are never implied by operational ones (see
 * `IMPLIED_CAPABILITIES` and the invariant tests).
 */

export const PROJECT_CAPABILITY_GROUPS = ['operational', 'financial', 'administrative'] as const;
export type ProjectCapabilityGroup = (typeof PROJECT_CAPABILITY_GROUPS)[number];

export const PROJECT_CAPABILITIES = {
  // ── Operational (no money) ────────────────────────────────────────────────
  PROJECT_VIEW: 'project.view',
  PROJECT_MANAGE: 'project.manage',
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_MANAGE: 'schedule.manage',
  TASKS_VIEW: 'tasks.view',
  TASKS_MANAGE: 'tasks.manage',
  CONTRACTOR_VIEW: 'contractor.view',
  CONTRACTOR_COORDINATE: 'contractor.coordinate',
  PROGRESS_VIEW: 'progress.view',
  PROGRESS_VERIFY: 'progress.verify',
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_SHARE: 'documents.share',
  RFI_MANAGE: 'rfi.manage',
  SUBMITTAL_MANAGE: 'submittal.manage',
  QUALITY_MANAGE: 'quality.manage',
  DEFECTS_MANAGE: 'defects.manage',
  DAILY_LOG_MANAGE: 'daily_log.manage',
  MEETINGS_MANAGE: 'meetings.manage',
  SAFETY_MANAGE: 'safety.manage',
  /** Approve pending attendance corrections and project-time rows for this project only (no payroll). */
  OPERATIONAL_APPROVE: 'operational.approve',

  // ── Financial (money visible or decided) ─────────────────────────────────
  FINANCIAL_VIEW: 'financial.view',
  CONTRACT_FINANCIAL_VIEW: 'contract.financial.view',
  CONTRACT_MANAGE: 'contract.manage',
  CHANGE_FINANCIAL_MANAGE: 'change.financial.manage',
  CLAIM_VIEW: 'claim.view',
  CLAIM_REVIEW: 'claim.review',
  CLAIM_CERTIFY: 'claim.certify',
  DEDUCTIONS_MANAGE: 'deductions.manage',
  RETENTION_MANAGE: 'retention.manage',
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_MANAGE: 'payment.manage',
  PROJECT_BUDGET_VIEW: 'project_budget.view',
  PROJECT_BUDGET_MANAGE: 'project_budget.manage',

  // ── Administrative ───────────────────────────────────────────────────────
  CONTRACTOR_INVITE: 'contractor.invite',
  EXTERNAL_ACCESS_MANAGE: 'external_access.manage',
  PROJECT_TEAM_MANAGE: 'project_team.manage',
  PROJECT_SETTINGS_MANAGE: 'project_settings.manage',
} as const;

export type ProjectCapability = (typeof PROJECT_CAPABILITIES)[keyof typeof PROJECT_CAPABILITIES];

export interface ProjectCapabilityDefinition {
  readonly key: ProjectCapability;
  readonly group: ProjectCapabilityGroup;
  /** English description; UI renders `projectTeam.capabilities.<capabilityMessageKey(key)>`. */
  readonly description: string;
}

const C = PROJECT_CAPABILITIES;

export const PROJECT_CAPABILITY_CATALOG: readonly ProjectCapabilityDefinition[] = [
  { key: C.PROJECT_VIEW, group: 'operational', description: 'Open the project and see its operational data' },
  { key: C.PROJECT_MANAGE, group: 'operational', description: 'Edit project details, structure and locations' },
  { key: C.SCHEDULE_VIEW, group: 'operational', description: 'View the project schedule' },
  { key: C.SCHEDULE_MANAGE, group: 'operational', description: 'Manage activities, milestones and coordination events' },
  { key: C.TASKS_VIEW, group: 'operational', description: 'View project tasks' },
  { key: C.TASKS_MANAGE, group: 'operational', description: 'Create, assign and verify project tasks' },
  { key: C.CONTRACTOR_VIEW, group: 'operational', description: 'See contractors on the project (no contract money)' },
  { key: C.CONTRACTOR_COORDINATE, group: 'operational', description: 'Coordinate contractors, issue instructions' },
  { key: C.PROGRESS_VIEW, group: 'operational', description: 'View physical progress' },
  { key: C.PROGRESS_VERIFY, group: 'operational', description: 'Confirm physical completion' },
  { key: C.DOCUMENTS_VIEW, group: 'operational', description: 'View project plans and documents' },
  { key: C.DOCUMENTS_SHARE, group: 'operational', description: 'Publish plan revisions and share documents with contractors' },
  { key: C.RFI_MANAGE, group: 'operational', description: 'Manage RFIs' },
  { key: C.SUBMITTAL_MANAGE, group: 'operational', description: 'Review submittals and material approvals' },
  { key: C.QUALITY_MANAGE, group: 'operational', description: 'Manage quality inspections' },
  { key: C.DEFECTS_MANAGE, group: 'operational', description: 'Manage defects and punch lists' },
  { key: C.DAILY_LOG_MANAGE, group: 'operational', description: 'Maintain the daily site log' },
  { key: C.MEETINGS_MANAGE, group: 'operational', description: 'Manage meetings and minutes' },
  { key: C.SAFETY_MANAGE, group: 'operational', description: 'Manage safety records' },
  {
    key: C.OPERATIONAL_APPROVE,
    group: 'operational',
    description: 'Approve pending attendance corrections and project hours for this project',
  },

  { key: C.FINANCIAL_VIEW, group: 'financial', description: 'See project-level financial totals' },
  { key: C.CONTRACT_FINANCIAL_VIEW, group: 'financial', description: 'See contractor contract values and prices' },
  { key: C.CONTRACT_MANAGE, group: 'financial', description: 'Create and edit contractor contracts and work lines' },
  { key: C.CHANGE_FINANCIAL_MANAGE, group: 'financial', description: 'Price, negotiate and approve contractor changes' },
  { key: C.CLAIM_VIEW, group: 'financial', description: 'View contractor progress claims and amounts' },
  { key: C.CLAIM_REVIEW, group: 'financial', description: 'Review and assess contractor claims' },
  { key: C.CLAIM_CERTIFY, group: 'financial', description: 'Certify contractor claims' },
  { key: C.DEDUCTIONS_MANAGE, group: 'financial', description: 'Issue contractor deductions and back-charges' },
  { key: C.RETENTION_MANAGE, group: 'financial', description: 'Manage retention holds and releases' },
  { key: C.PAYMENT_VIEW, group: 'financial', description: 'View contractor payments and balances' },
  { key: C.PAYMENT_MANAGE, group: 'financial', description: 'Manage payment eligibility and payments' },
  { key: C.PROJECT_BUDGET_VIEW, group: 'financial', description: 'View the project budget and cost control' },
  { key: C.PROJECT_BUDGET_MANAGE, group: 'financial', description: 'Edit the project budget' },

  { key: C.CONTRACTOR_INVITE, group: 'administrative', description: 'Invite contractor companies and users' },
  { key: C.EXTERNAL_ACCESS_MANAGE, group: 'administrative', description: 'Manage external access grants' },
  { key: C.PROJECT_TEAM_MANAGE, group: 'administrative', description: 'Manage the project team and their capabilities' },
  { key: C.PROJECT_SETTINGS_MANAGE, group: 'administrative', description: 'Change project settings' },
];

export const ALL_PROJECT_CAPABILITIES: readonly ProjectCapability[] = PROJECT_CAPABILITY_CATALOG.map(
  (definition) => definition.key,
);

const CAPABILITY_SET = new Set<string>(ALL_PROJECT_CAPABILITIES);

export function isProjectCapability(value: unknown): value is ProjectCapability {
  return typeof value === 'string' && CAPABILITY_SET.has(value);
}

const GROUP_BY_KEY = new Map<ProjectCapability, ProjectCapabilityGroup>(
  PROJECT_CAPABILITY_CATALOG.map((definition) => [definition.key, definition.group]),
);

export function capabilityGroup(capability: ProjectCapability): ProjectCapabilityGroup {
  return GROUP_BY_KEY.get(capability)!;
}

export function isFinancialCapability(capability: ProjectCapability): boolean {
  return capabilityGroup(capability) === 'financial';
}

export const FINANCIAL_PROJECT_CAPABILITIES: readonly ProjectCapability[] = ALL_PROJECT_CAPABILITIES.filter(
  isFinancialCapability,
);

export const OPERATIONAL_PROJECT_CAPABILITIES: readonly ProjectCapability[] = ALL_PROJECT_CAPABILITIES.filter(
  (capability) => capabilityGroup(capability) === 'operational',
);

/**
 * "Holding X also gives you Y." Closure is computed by `expandCapabilities`.
 *
 * Rules (enforced by tests):
 *  - Every capability implies `project.view` (you cannot act on a project you cannot open).
 *  - An operational capability never implies a financial one.
 *  - `manage`/`certify`-style capabilities imply their read counterpart.
 */
export const IMPLIED_CAPABILITIES: Readonly<Record<ProjectCapability, readonly ProjectCapability[]>> = {
  [C.PROJECT_VIEW]: [],
  [C.PROJECT_MANAGE]: [C.PROJECT_VIEW],
  [C.SCHEDULE_VIEW]: [C.PROJECT_VIEW],
  [C.SCHEDULE_MANAGE]: [C.SCHEDULE_VIEW],
  [C.TASKS_VIEW]: [C.PROJECT_VIEW],
  [C.TASKS_MANAGE]: [C.TASKS_VIEW],
  [C.CONTRACTOR_VIEW]: [C.PROJECT_VIEW],
  [C.CONTRACTOR_COORDINATE]: [C.CONTRACTOR_VIEW],
  [C.PROGRESS_VIEW]: [C.PROJECT_VIEW],
  [C.PROGRESS_VERIFY]: [C.PROGRESS_VIEW],
  [C.DOCUMENTS_VIEW]: [C.PROJECT_VIEW],
  [C.DOCUMENTS_SHARE]: [C.DOCUMENTS_VIEW],
  [C.RFI_MANAGE]: [C.PROJECT_VIEW],
  [C.SUBMITTAL_MANAGE]: [C.PROJECT_VIEW],
  [C.QUALITY_MANAGE]: [C.PROJECT_VIEW],
  [C.DEFECTS_MANAGE]: [C.PROJECT_VIEW],
  [C.DAILY_LOG_MANAGE]: [C.PROJECT_VIEW],
  [C.MEETINGS_MANAGE]: [C.PROJECT_VIEW],
  [C.SAFETY_MANAGE]: [C.PROJECT_VIEW],
  [C.OPERATIONAL_APPROVE]: [C.PROJECT_VIEW],

  [C.FINANCIAL_VIEW]: [C.PROJECT_VIEW],
  [C.CONTRACT_FINANCIAL_VIEW]: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
  [C.CONTRACT_MANAGE]: [C.CONTRACT_FINANCIAL_VIEW],
  [C.CHANGE_FINANCIAL_MANAGE]: [C.CONTRACT_FINANCIAL_VIEW],
  [C.CLAIM_VIEW]: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
  [C.CLAIM_REVIEW]: [C.CLAIM_VIEW],
  [C.CLAIM_CERTIFY]: [C.CLAIM_REVIEW],
  [C.DEDUCTIONS_MANAGE]: [C.CLAIM_VIEW],
  [C.RETENTION_MANAGE]: [C.CLAIM_VIEW],
  [C.PAYMENT_VIEW]: [C.PROJECT_VIEW, C.CONTRACTOR_VIEW],
  [C.PAYMENT_MANAGE]: [C.PAYMENT_VIEW],
  [C.PROJECT_BUDGET_VIEW]: [C.PROJECT_VIEW],
  [C.PROJECT_BUDGET_MANAGE]: [C.PROJECT_BUDGET_VIEW],

  [C.CONTRACTOR_INVITE]: [C.CONTRACTOR_VIEW],
  [C.EXTERNAL_ACCESS_MANAGE]: [C.CONTRACTOR_VIEW],
  [C.PROJECT_TEAM_MANAGE]: [C.PROJECT_VIEW],
  [C.PROJECT_SETTINGS_MANAGE]: [C.PROJECT_VIEW],
};

/** Transitive closure of the granted capabilities. Unknown values are ignored. */
export function expandCapabilities(granted: Iterable<string>): Set<ProjectCapability> {
  const result = new Set<ProjectCapability>();
  const stack: ProjectCapability[] = [];
  for (const value of granted) {
    if (isProjectCapability(value)) stack.push(value);
  }
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (result.has(next)) continue;
    result.add(next);
    for (const implied of IMPLIED_CAPABILITIES[next]) stack.push(implied);
  }
  return result;
}

/** True when every capability in `wanted` is covered by `held` (after closure). */
export function capabilitiesCover(
  held: ReadonlySet<ProjectCapability>,
  wanted: Iterable<ProjectCapability>,
): boolean {
  for (const capability of wanted) {
    if (!held.has(capability)) return false;
  }
  return true;
}
