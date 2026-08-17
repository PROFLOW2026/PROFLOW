/**
 * Canonical permission catalog (doc 73 §5).
 *
 * These string keys are the only authorization gate in the product. Nothing in
 * the codebase may branch on a role display name; see `assertPermission`.
 *
 * Adding a key here is a schema change: it must also be seeded through
 * `drizzle/seed/system.ts` so the database catalog stays in sync.
 */

export const PERMISSION_CATEGORIES = [
  'organization',
  'projects',
  'financials',
  'clients',
  'commercial',
  'expenses',
  'vendors',
  'workforce',
  'billing',
  'documents',
  'administration',
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export const PERMISSIONS = {
  ORG_READ: 'org.read',
  ORG_UPDATE: 'org.update',
  MEMBERS_READ: 'members.read',
  MEMBERS_MANAGE: 'members.manage',
  ROLES_MANAGE: 'roles.manage',
  INVITATIONS_MANAGE: 'invitations.manage',

  PROJECTS_READ: 'projects.read',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_UPDATE: 'projects.update',
  PROJECTS_ARCHIVE: 'projects.archive',

  PROJECT_FINANCIALS_READ: 'project_financials.read',
  PROJECT_PROFIT_READ: 'project_profit.read',

  CLIENTS_READ: 'clients.read',
  CLIENTS_MANAGE: 'clients.manage',

  CONTRACTS_READ: 'contracts.read',
  CONTRACTS_MANAGE: 'contracts.manage',

  CHANGES_READ: 'changes.read',
  CHANGES_MANAGE: 'changes.manage',
  CHANGES_APPROVE: 'changes.approve',

  EXPENSES_READ: 'expenses.read',
  EXPENSES_CREATE: 'expenses.create',
  EXPENSES_UPDATE: 'expenses.update',
  EXPENSES_FINALIZE: 'expenses.finalize',

  VENDORS_READ: 'vendors.read',
  VENDORS_MANAGE: 'vendors.manage',

  WORKFORCE_READ: 'workforce.read',
  WORKFORCE_MANAGE: 'workforce.manage',
  /**
   * Employer / business cost only (compensation versions, month costs, allocation runs).
   * Distinct from WORKFORCE_READ so ordinary roster/time viewers never see private rates.
   */
  WORKFORCE_COST_READ: 'workforce.cost.read',
  WORKFORCE_COST_MANAGE: 'workforce.cost.manage',
  TIME_MANAGE: 'time.manage',
  ATTENDANCE_READ: 'attendance.read',
  ATTENDANCE_MANAGE: 'attendance.manage',
  ATTENDANCE_SELF: 'attendance.self',

  BILLING_READ: 'billing.read',
  BILLING_MANAGE: 'billing.manage',

  DOCUMENTS_READ: 'documents.read',
  DOCUMENTS_MANAGE: 'documents.manage',

  CRM_READ: 'crm.read',
  CRM_MANAGE: 'crm.manage',

  COMPLIANCE_READ: 'compliance.read',
  COMPLIANCE_MANAGE: 'compliance.manage',

  CUSTOM_FIELDS_MANAGE: 'custom_fields.manage',
  PORTAL_MANAGE: 'portal.manage',
  API_MANAGE: 'api.manage',

  PROCUREMENT_READ: 'procurement.read',
  PROCUREMENT_MANAGE: 'procurement.manage',
  MATERIALS_READ: 'materials.read',
  MATERIALS_MANAGE: 'materials.manage',

  FIELD_OPS_READ: 'field_ops.read',
  FIELD_OPS_MANAGE: 'field_ops.manage',
  ASSETS_READ: 'assets.read',
  ASSETS_MANAGE: 'assets.manage',

  AP_READ: 'ap.read',
  AP_MANAGE: 'ap.manage',

  BANKING_READ: 'banking.read',
  BANKING_MANAGE: 'banking.manage',

  PLANNING_READ: 'planning.read',
  PLANNING_WRITE: 'planning.write',

  QUOTES_READ: 'quotes.read',
  QUOTES_MANAGE: 'quotes.manage',

  SERVICE_READ: 'service.read',
  SERVICE_MANAGE: 'service.manage',
  DISPATCH_MANAGE: 'dispatch.manage',

  APPROVALS_READ: 'approvals.read',
  APPROVALS_MANAGE: 'approvals.manage',
  APPROVALS_DECIDE: 'approvals.decide',

  MONTH_CLOSE_READ: 'month_close.read',
  MONTH_CLOSE_MANAGE: 'month_close.manage',

  BUDGETS_READ: 'budgets.read',
  BUDGETS_MANAGE: 'budgets.manage',

  BOQ_READ: 'boq.read',
  BOQ_MANAGE: 'boq.manage',
  BOQ_PROGRESS_SUBMIT: 'boq.progress.submit',
  BOQ_PROGRESS_APPROVE: 'boq.progress.approve',
  BOQ_BILLING_CREATE: 'boq.billing.create',

  FORMS_READ: 'forms.read',
  FORMS_SUBMIT: 'forms.submit',
  FORMS_MANAGE: 'forms.manage',

  COMMAND_CENTER_READ: 'command_center.read',

  NOTIFICATIONS_READ: 'notifications.read',
  TIME_APPROVE: 'time.approve',
  PROJECTS_ACCESS_ALL: 'projects.access_all',
  SCHEDULING_READ: 'scheduling.read',
  SCHEDULING_MANAGE: 'scheduling.manage',
  SAFETY_READ: 'safety.read',
  SAFETY_MANAGE: 'safety.manage',

  SETTINGS_MANAGE: 'settings.manage',
  TAX_MANAGE: 'tax.manage',
  AUDIT_READ: 'audit.read',

  COMMUNICATIONS_READ: 'communications.read',
  COMMUNICATIONS_MANAGE: 'communications.manage',
  AUTOMATIONS_READ: 'automations.read',
  AUTOMATIONS_MANAGE: 'automations.manage',
  ASSISTANT_USE: 'assistant.use',
  INTEGRATIONS_READ: 'integrations.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  readonly key: PermissionKey;
  readonly category: PermissionCategory;
  /** English description - the UI renders the translated `permissions.<key>` message. */
  readonly description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { key: PERMISSIONS.ORG_READ, category: 'organization', description: 'View organization profile' },
  { key: PERMISSIONS.ORG_UPDATE, category: 'organization', description: 'Update organization profile' },
  { key: PERMISSIONS.MEMBERS_READ, category: 'organization', description: 'View organization members' },
  { key: PERMISSIONS.MEMBERS_MANAGE, category: 'organization', description: 'Add, suspend and remove members' },
  { key: PERMISSIONS.ROLES_MANAGE, category: 'organization', description: 'Assign roles and adjust role permissions' },
  { key: PERMISSIONS.INVITATIONS_MANAGE, category: 'organization', description: 'Invite people to the organization' },

  { key: PERMISSIONS.PROJECTS_READ, category: 'projects', description: 'View projects' },
  { key: PERMISSIONS.PROJECTS_CREATE, category: 'projects', description: 'Create projects' },
  { key: PERMISSIONS.PROJECTS_UPDATE, category: 'projects', description: 'Update project details' },
  { key: PERMISSIONS.PROJECTS_ARCHIVE, category: 'projects', description: 'Archive and restore projects' },

  {
    key: PERMISSIONS.PROJECT_FINANCIALS_READ,
    category: 'financials',
    description: 'View project costs and operational financials',
  },
  {
    key: PERMISSIONS.PROJECT_PROFIT_READ,
    category: 'financials',
    description: 'View profit and margin figures',
  },

  { key: PERMISSIONS.CLIENTS_READ, category: 'clients', description: 'View clients' },
  { key: PERMISSIONS.CLIENTS_MANAGE, category: 'clients', description: 'Create and update clients' },

  { key: PERMISSIONS.CONTRACTS_READ, category: 'commercial', description: 'View contracts and contract values' },
  { key: PERMISSIONS.CONTRACTS_MANAGE, category: 'commercial', description: 'Create and update contracts' },

  { key: PERMISSIONS.CHANGES_READ, category: 'commercial', description: 'View change requests and change orders' },
  { key: PERMISSIONS.CHANGES_MANAGE, category: 'commercial', description: 'Create and price change requests' },
  {
    key: PERMISSIONS.CHANGES_APPROVE,
    category: 'commercial',
    description: 'Record approval decisions that create change orders',
  },

  { key: PERMISSIONS.EXPENSES_READ, category: 'expenses', description: 'View expenses' },
  { key: PERMISSIONS.EXPENSES_CREATE, category: 'expenses', description: 'Record expenses' },
  { key: PERMISSIONS.EXPENSES_UPDATE, category: 'expenses', description: 'Update draft expenses and allocations' },
  { key: PERMISSIONS.EXPENSES_FINALIZE, category: 'expenses', description: 'Finalize, void and adjust expenses' },

  { key: PERMISSIONS.VENDORS_READ, category: 'vendors', description: 'View vendors and subcontractors' },
  { key: PERMISSIONS.VENDORS_MANAGE, category: 'vendors', description: 'Create and update vendors' },

  { key: PERMISSIONS.WORKFORCE_READ, category: 'workforce', description: 'View employees and time entries (not employer cost)' },
  { key: PERMISSIONS.WORKFORCE_MANAGE, category: 'workforce', description: 'Manage employee master records (not employer cost)' },
  {
    key: PERMISSIONS.WORKFORCE_COST_READ,
    category: 'workforce',
    description: 'View compensation terms, employer month costs and labor allocation runs',
  },
  {
    key: PERMISSIONS.WORKFORCE_COST_MANAGE,
    category: 'workforce',
    description: 'Manage compensation terms, employer month costs and labor allocation runs',
  },
  { key: PERMISSIONS.TIME_MANAGE, category: 'workforce', description: 'Record and edit time entries' },
  {
    key: PERMISSIONS.ATTENDANCE_READ,
    category: 'workforce',
    description: 'View attendance records for the organization',
  },
  {
    key: PERMISSIONS.ATTENDANCE_MANAGE,
    category: 'workforce',
    description: 'Enter and correct attendance for any employee',
  },
  {
    key: PERMISSIONS.ATTENDANCE_SELF,
    category: 'workforce',
    description: 'Clock in/out and view own attendance only',
  },

  { key: PERMISSIONS.BILLING_READ, category: 'billing', description: 'View billing records and payments' },
  { key: PERMISSIONS.BILLING_MANAGE, category: 'billing', description: 'Create billing records and record payments' },

  { key: PERMISSIONS.DOCUMENTS_READ, category: 'documents', description: 'View and download documents' },
  { key: PERMISSIONS.DOCUMENTS_MANAGE, category: 'documents', description: 'Upload, link and remove documents' },

  { key: PERMISSIONS.CRM_READ, category: 'commercial', description: 'View CRM prospects, opportunities and sales quotes' },
  { key: PERMISSIONS.CRM_MANAGE, category: 'commercial', description: 'Manage CRM pipeline and convert won deals' },

  { key: PERMISSIONS.COMPLIANCE_READ, category: 'administration', description: 'View compliance artifacts' },
  {
    key: PERMISSIONS.COMPLIANCE_MANAGE,
    category: 'administration',
    description: 'Manage insurance, licenses and certifications',
  },
  {
    key: PERMISSIONS.CUSTOM_FIELDS_MANAGE,
    category: 'administration',
    description: 'Define governed custom fields',
  },
  {
    key: PERMISSIONS.PORTAL_MANAGE,
    category: 'administration',
    description: 'Manage external portal access grants',
  },
  {
    key: PERMISSIONS.API_MANAGE,
    category: 'administration',
    description: 'Manage API clients, keys and webhooks',
  },

  {
    key: PERMISSIONS.PROCUREMENT_READ,
    category: 'expenses',
    description: 'View RFQs, supplier quotes and purchase orders',
  },
  {
    key: PERMISSIONS.PROCUREMENT_MANAGE,
    category: 'expenses',
    description: 'Manage procurement and purchase orders',
  },
  {
    key: PERMISSIONS.MATERIALS_READ,
    category: 'expenses',
    description: 'View material catalog',
  },
  {
    key: PERMISSIONS.MATERIALS_MANAGE,
    category: 'expenses',
    description: 'Manage material catalog and prices',
  },

  {
    key: PERMISSIONS.FIELD_OPS_READ,
    category: 'projects',
    description: 'View daily logs, punch lists and inspections',
  },
  {
    key: PERMISSIONS.FIELD_OPS_MANAGE,
    category: 'projects',
    description: 'Manage field operations records',
  },
  {
    key: PERMISSIONS.ASSETS_READ,
    category: 'expenses',
    description: 'View assets and equipment',
  },
  {
    key: PERMISSIONS.ASSETS_MANAGE,
    category: 'expenses',
    description: 'Manage assets, fleet and maintenance',
  },

  {
    key: PERMISSIONS.AP_READ,
    category: 'expenses',
    description: 'View vendor bills and PO matches',
  },
  {
    key: PERMISSIONS.AP_MANAGE,
    category: 'expenses',
    description: 'Manage vendor bills and PO matching',
  },

  {
    key: PERMISSIONS.BANKING_READ,
    category: 'financials',
    description: 'View bank accounts, transactions and match suggestions',
  },
  {
    key: PERMISSIONS.BANKING_MANAGE,
    category: 'financials',
    description: 'Manage bank accounts, imports and match decisions',
  },

  {
    key: PERMISSIONS.PLANNING_READ,
    category: 'projects',
    description: 'View project planning work items and dependencies',
  },
  {
    key: PERMISSIONS.PLANNING_WRITE,
    category: 'projects',
    description: 'Create and update project planning work items and dependencies',
  },

  { key: PERMISSIONS.QUOTES_READ, category: 'commercial', description: 'View estimates and quotes' },
  { key: PERMISSIONS.QUOTES_MANAGE, category: 'commercial', description: 'Create and manage estimates and quotes' },

  { key: PERMISSIONS.SERVICE_READ, category: 'projects', description: 'View work orders and service jobs' },
  { key: PERMISSIONS.SERVICE_MANAGE, category: 'projects', description: 'Create and manage work orders and service jobs' },
  { key: PERMISSIONS.DISPATCH_MANAGE, category: 'projects', description: 'Assign and schedule daily dispatch' },

  { key: PERMISSIONS.APPROVALS_READ, category: 'administration', description: 'View approval requests' },
  { key: PERMISSIONS.APPROVALS_MANAGE, category: 'administration', description: 'Configure approval rules' },
  { key: PERMISSIONS.APPROVALS_DECIDE, category: 'administration', description: 'Approve or reject pending requests' },

  { key: PERMISSIONS.MONTH_CLOSE_READ, category: 'financials', description: 'View month-close status and completeness' },
  { key: PERMISSIONS.MONTH_CLOSE_MANAGE, category: 'financials', description: 'Close months and record post-close corrections' },

  { key: PERMISSIONS.BUDGETS_READ, category: 'financials', description: 'View project/job budgets and variance' },
  { key: PERMISSIONS.BUDGETS_MANAGE, category: 'financials', description: 'Create and revise project/job budgets' },

  { key: PERMISSIONS.BOQ_READ, category: 'commercial', description: 'View bill of quantities and progress' },
  { key: PERMISSIONS.BOQ_MANAGE, category: 'commercial', description: 'Create and manage BOQ baselines and items' },
  {
    key: PERMISSIONS.BOQ_PROGRESS_SUBMIT,
    category: 'commercial',
    description: 'Submit BOQ measurement quantities',
  },
  {
    key: PERMISSIONS.BOQ_PROGRESS_APPROVE,
    category: 'commercial',
    description: 'Approve BOQ progress batches',
  },
  {
    key: PERMISSIONS.BOQ_BILLING_CREATE,
    category: 'billing',
    description: 'Create progress billing from approved BOQ progress',
  },

  { key: PERMISSIONS.FORMS_READ, category: 'projects', description: 'View field forms and submissions' },
  { key: PERMISSIONS.FORMS_SUBMIT, category: 'projects', description: 'Fill and submit field forms' },
  { key: PERMISSIONS.FORMS_MANAGE, category: 'projects', description: 'Manage form templates (not required to submit)' },

  {
    key: PERMISSIONS.COMMAND_CENTER_READ,
    category: 'organization',
    description: 'View Today actionable items',
  },
  { key: PERMISSIONS.NOTIFICATIONS_READ, category: 'organization', description: 'View in-app notifications' },
  { key: PERMISSIONS.TIME_APPROVE, category: 'workforce', description: 'Approve, return and lock timesheets' },
  {
    key: PERMISSIONS.PROJECTS_ACCESS_ALL,
    category: 'projects',
    description: 'See every project regardless of assignment-scoped access mode',
  },
  { key: PERMISSIONS.SCHEDULING_READ, category: 'workforce', description: 'View resource scheduling and availability' },
  { key: PERMISSIONS.SCHEDULING_MANAGE, category: 'workforce', description: 'Create and change resource bookings' },
  { key: PERMISSIONS.SAFETY_READ, category: 'projects', description: 'View safety and HSE records' },
  { key: PERMISSIONS.SAFETY_MANAGE, category: 'projects', description: 'Create and close safety records and actions' },

  { key: PERMISSIONS.SETTINGS_MANAGE, category: 'administration', description: 'Change organization settings' },
  { key: PERMISSIONS.TAX_MANAGE, category: 'administration', description: 'Manage tax rules and overrides' },
  { key: PERMISSIONS.AUDIT_READ, category: 'administration', description: 'Read the audit trail' },

  {
    key: PERMISSIONS.COMMUNICATIONS_READ,
    category: 'organization',
    description: 'View outbound business communications',
  },
  {
    key: PERMISSIONS.COMMUNICATIONS_MANAGE,
    category: 'organization',
    description: 'Prepare and send outbound business communications',
  },
  {
    key: PERMISSIONS.AUTOMATIONS_READ,
    category: 'administration',
    description: 'View business automation rules and run history',
  },
  {
    key: PERMISSIONS.AUTOMATIONS_MANAGE,
    category: 'administration',
    description: 'Configure business automation presets',
  },
  {
    key: PERMISSIONS.ASSISTANT_USE,
    category: 'organization',
    description: 'Use the in-product assistant within existing permissions',
  },
  {
    key: PERMISSIONS.INTEGRATIONS_READ,
    category: 'administration',
    description: 'View external integration connection state',
  },
];

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map((p) => p.key);

const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

/**
 * Permissions that expose money. Used by the UI to decide whether a financial
 * widget renders at all, and by tests that assert financial visibility rules.
 */
export const FINANCIAL_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.PROJECT_FINANCIALS_READ,
  PERMISSIONS.PROJECT_PROFIT_READ,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.BILLING_MANAGE,
  PERMISSIONS.WORKFORCE_COST_READ,
  PERMISSIONS.WORKFORCE_COST_MANAGE,
];
