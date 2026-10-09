import {
  ALL_PROJECT_CAPABILITIES,
  FINANCIAL_PROJECT_CAPABILITIES,
  OPERATIONAL_PROJECT_CAPABILITIES,
  PROJECT_CAPABILITIES as C,
  expandCapabilities,
  type ProjectCapability,
} from './capabilities';

/**
 * Capability templates are starting points, never roles. A project member holds a
 * set of capabilities; applying a template just pre-fills that set, and the
 * result stays editable per person and per project.
 */

export const PROJECT_TEMPLATE_KEYS = [
  'project_manager_full',
  'project_manager_operational',
  'site_manager',
  'foreman',
  'execution_engineer',
  'quantity_surveyor',
  'project_accountant',
  'document_controller',
  'safety_manager',
  'quality_manager',
  'consultant',
  'viewer',
  'senior_project_manager',
  'project_secretary',
  'client_coordinator',
  'developer_representative',
] as const;

export type ProjectTemplateKey = (typeof PROJECT_TEMPLATE_KEYS)[number];

export type TemplateFinancialAccess = 'none' | 'limited' | 'full';

export interface ProjectCapabilityTemplate {
  readonly key: ProjectTemplateKey;
  /** English name; UI renders `projectTeam.templates.<key>`. */
  readonly name: string;
  /** `none` templates must contain zero financial capabilities (tested). */
  readonly financialAccess: TemplateFinancialAccess;
  readonly capabilities: readonly ProjectCapability[];
}

const OPS_FULL: readonly ProjectCapability[] = OPERATIONAL_PROJECT_CAPABILITIES;

export const PROJECT_CAPABILITY_TEMPLATES: readonly ProjectCapabilityTemplate[] = [
  {
    key: 'project_manager_full',
    name: 'Project Manager (full)',
    financialAccess: 'full',
    capabilities: ALL_PROJECT_CAPABILITIES,
  },
  {
    key: 'project_manager_operational',
    name: 'Project Manager (operational, no financials)',
    financialAccess: 'none',
    capabilities: OPS_FULL,
  },
  {
    key: 'site_manager',
    name: 'Site Manager',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.SCHEDULE_MANAGE,
      C.TASKS_MANAGE,
      C.CONTRACTOR_COORDINATE,
      C.PROGRESS_VERIFY,
      C.DOCUMENTS_VIEW,
      C.RFI_MANAGE,
      C.QUALITY_MANAGE,
      C.DEFECTS_MANAGE,
      C.DAILY_LOG_MANAGE,
      C.MEETINGS_MANAGE,
      C.SAFETY_MANAGE,
    ],
  },
  {
    key: 'foreman',
    name: 'Foreman',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.SCHEDULE_VIEW,
      C.TASKS_MANAGE,
      C.CONTRACTOR_VIEW,
      C.PROGRESS_VIEW,
      C.DOCUMENTS_VIEW,
      C.DEFECTS_MANAGE,
      C.DAILY_LOG_MANAGE,
    ],
  },
  {
    key: 'execution_engineer',
    name: 'Execution Engineer',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.SCHEDULE_MANAGE,
      C.TASKS_MANAGE,
      C.CONTRACTOR_COORDINATE,
      C.PROGRESS_VERIFY,
      C.DOCUMENTS_SHARE,
      C.RFI_MANAGE,
      C.SUBMITTAL_MANAGE,
      C.QUALITY_MANAGE,
      C.DEFECTS_MANAGE,
      C.DAILY_LOG_MANAGE,
    ],
  },
  {
    key: 'quantity_surveyor',
    name: 'Quantity Surveyor',
    financialAccess: 'full',
    capabilities: [
      C.PROJECT_VIEW,
      C.CONTRACTOR_VIEW,
      C.PROGRESS_VIEW,
      C.DOCUMENTS_VIEW,
      C.FINANCIAL_VIEW,
      C.CONTRACT_FINANCIAL_VIEW,
      C.CHANGE_FINANCIAL_MANAGE,
      C.CLAIM_REVIEW,
      C.DEDUCTIONS_MANAGE,
      C.PROJECT_BUDGET_VIEW,
    ],
  },
  {
    key: 'project_accountant',
    name: 'Project Accountant',
    financialAccess: 'full',
    capabilities: [
      C.PROJECT_VIEW,
      C.CONTRACTOR_VIEW,
      C.FINANCIAL_VIEW,
      C.CONTRACT_FINANCIAL_VIEW,
      C.CLAIM_VIEW,
      C.RETENTION_MANAGE,
      C.PAYMENT_MANAGE,
      C.PROJECT_BUDGET_VIEW,
    ],
  },
  {
    key: 'document_controller',
    name: 'Document Controller',
    financialAccess: 'none',
    capabilities: [C.PROJECT_VIEW, C.DOCUMENTS_SHARE, C.RFI_MANAGE, C.SUBMITTAL_MANAGE, C.CONTRACTOR_VIEW],
  },
  {
    key: 'safety_manager',
    name: 'Safety Manager',
    financialAccess: 'none',
    capabilities: [C.PROJECT_VIEW, C.SAFETY_MANAGE, C.CONTRACTOR_VIEW, C.TASKS_MANAGE, C.DOCUMENTS_VIEW],
  },
  {
    key: 'quality_manager',
    name: 'Quality Manager',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.QUALITY_MANAGE,
      C.DEFECTS_MANAGE,
      C.PROGRESS_VERIFY,
      C.CONTRACTOR_VIEW,
      C.DOCUMENTS_VIEW,
      C.TASKS_MANAGE,
    ],
  },
  {
    key: 'consultant',
    name: 'Consultant',
    financialAccess: 'none',
    capabilities: [C.PROJECT_VIEW, C.DOCUMENTS_VIEW, C.RFI_MANAGE, C.SUBMITTAL_MANAGE, C.SCHEDULE_VIEW],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    financialAccess: 'none',
    capabilities: [C.PROJECT_VIEW, C.SCHEDULE_VIEW, C.TASKS_VIEW, C.CONTRACTOR_VIEW, C.PROGRESS_VIEW, C.DOCUMENTS_VIEW],
  },
  {
    key: 'senior_project_manager',
    name: 'Senior project manager',
    financialAccess: 'none',
    capabilities: OPS_FULL,
  },
  {
    key: 'project_secretary',
    name: 'Project secretary / administrator',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.CONTRACTOR_VIEW,
      C.DOCUMENTS_SHARE,
      C.MEETINGS_MANAGE,
      C.TASKS_MANAGE,
      C.SCHEDULE_VIEW,
      C.CONTRACTOR_INVITE,
      C.EXTERNAL_ACCESS_MANAGE,
    ],
  },
  {
    key: 'client_coordinator',
    name: 'Client coordinator',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.DOCUMENTS_VIEW,
      C.MEETINGS_MANAGE,
      C.SCHEDULE_VIEW,
      C.TASKS_VIEW,
      C.CONTRACTOR_VIEW,
      C.OPERATIONAL_APPROVE,
    ],
  },
  {
    key: 'developer_representative',
    name: 'Developer representative',
    financialAccess: 'none',
    capabilities: [
      C.PROJECT_VIEW,
      C.CONTRACTOR_VIEW,
      C.DOCUMENTS_VIEW,
      C.SCHEDULE_VIEW,
      C.PROGRESS_VIEW,
      C.MEETINGS_MANAGE,
      C.TASKS_VIEW,
    ],
  },
];

export function isProjectTemplateKey(value: unknown): value is ProjectTemplateKey {
  return typeof value === 'string' && (PROJECT_TEMPLATE_KEYS as readonly string[]).includes(value);
}

export function projectCapabilityTemplate(key: ProjectTemplateKey): ProjectCapabilityTemplate {
  const template = PROJECT_CAPABILITY_TEMPLATES.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`Unknown project capability template: ${key}`);
  return template;
}

/** Template capabilities after implication closure, sorted for stable persistence. */
export function expandTemplate(key: ProjectTemplateKey): ProjectCapability[] {
  return [...expandCapabilities(projectCapabilityTemplate(key).capabilities)].sort();
}

export { FINANCIAL_PROJECT_CAPABILITIES };
