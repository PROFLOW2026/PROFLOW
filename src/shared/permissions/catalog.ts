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
  TIME_MANAGE: 'time.manage',

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

  SETTINGS_MANAGE: 'settings.manage',
  TAX_MANAGE: 'tax.manage',
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface PermissionDefinition {
  readonly key: PermissionKey;
  readonly category: PermissionCategory;
  /** English description — the UI renders the translated `permissions.<key>` message. */
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

  { key: PERMISSIONS.WORKFORCE_READ, category: 'workforce', description: 'View employees, rates and time entries' },
  { key: PERMISSIONS.WORKFORCE_MANAGE, category: 'workforce', description: 'Manage employees and cost rates' },
  { key: PERMISSIONS.TIME_MANAGE, category: 'workforce', description: 'Record and edit time entries' },

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

  { key: PERMISSIONS.SETTINGS_MANAGE, category: 'administration', description: 'Change organization settings' },
  { key: PERMISSIONS.TAX_MANAGE, category: 'administration', description: 'Manage tax rules and overrides' },
  { key: PERMISSIONS.AUDIT_READ, category: 'administration', description: 'Read the audit trail' },
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
];
