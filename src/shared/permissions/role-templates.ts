import { ALL_PERMISSION_KEYS, PERMISSIONS, type PermissionKey } from './catalog';

/**
 * Role templates (docs 65 H1/H2, 73 §6 §9).
 *
 * Templates are cloned into every organization at creation time, so an owner
 * can later adjust one organization's roles without affecting anyone else.
 *
 * Financial visibility defaults follow H2: manager and worker get no profit
 * permission; the owner can grant it per organization.
 */

export const ROLE_TEMPLATE_KEYS = ['owner', 'manager', 'worker', 'finance'] as const;
export type RoleTemplateKey = (typeof ROLE_TEMPLATE_KEYS)[number];

export interface RoleTemplate {
  readonly key: RoleTemplateKey;
  /** English canonical name; UI renders `roles.<key>.name`. */
  readonly name: string;
  readonly description: string;
  /** Sort order in role pickers. */
  readonly rank: number;
  /** The owner role cannot be emptied or removed from the last owner. */
  readonly isProtected: boolean;
  readonly permissions: readonly PermissionKey[];
}

const MANAGER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.MEMBERS_READ,
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.PROJECTS_CREATE,
  PERMISSIONS.PROJECTS_UPDATE,
  PERMISSIONS.PROJECTS_ARCHIVE,
  PERMISSIONS.PROJECT_FINANCIALS_READ,
  PERMISSIONS.CLIENTS_READ,
  PERMISSIONS.CLIENTS_MANAGE,
  PERMISSIONS.CONTRACTS_READ,
  PERMISSIONS.CONTRACTS_MANAGE,
  PERMISSIONS.CHANGES_READ,
  PERMISSIONS.CHANGES_MANAGE,
  PERMISSIONS.CHANGES_APPROVE,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.EXPENSES_UPDATE,
  PERMISSIONS.EXPENSES_FINALIZE,
  PERMISSIONS.VENDORS_READ,
  PERMISSIONS.VENDORS_MANAGE,
  PERMISSIONS.WORKFORCE_READ,
  PERMISSIONS.TIME_MANAGE,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_MANAGE,
  PERMISSIONS.CRM_READ,
  PERMISSIONS.CRM_MANAGE,
  PERMISSIONS.COMPLIANCE_READ,
  PERMISSIONS.PROCUREMENT_READ,
  PERMISSIONS.PROCUREMENT_MANAGE,
  PERMISSIONS.MATERIALS_READ,
  PERMISSIONS.MATERIALS_MANAGE,
  PERMISSIONS.FIELD_OPS_READ,
  PERMISSIONS.FIELD_OPS_MANAGE,
  PERMISSIONS.ASSETS_READ,
  PERMISSIONS.ASSETS_MANAGE,
  PERMISSIONS.AP_READ,
  PERMISSIONS.AP_MANAGE,
];

const WORKER_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.TIME_MANAGE,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_MANAGE,
];

const FINANCE_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.MEMBERS_READ,
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.PROJECT_FINANCIALS_READ,
  PERMISSIONS.PROJECT_PROFIT_READ,
  PERMISSIONS.CLIENTS_READ,
  PERMISSIONS.CLIENTS_MANAGE,
  PERMISSIONS.CONTRACTS_READ,
  PERMISSIONS.CHANGES_READ,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.EXPENSES_UPDATE,
  PERMISSIONS.EXPENSES_FINALIZE,
  PERMISSIONS.VENDORS_READ,
  PERMISSIONS.VENDORS_MANAGE,
  PERMISSIONS.WORKFORCE_READ,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.BILLING_MANAGE,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_MANAGE,
  PERMISSIONS.TAX_MANAGE,
  PERMISSIONS.AUDIT_READ,
  PERMISSIONS.CRM_READ,
  PERMISSIONS.COMPLIANCE_READ,
  PERMISSIONS.PROCUREMENT_READ,
  PERMISSIONS.MATERIALS_READ,
  PERMISSIONS.FIELD_OPS_READ,
  PERMISSIONS.ASSETS_READ,
  PERMISSIONS.AP_READ,
];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    key: 'owner',
    name: 'Owner',
    description: 'Full access to the business, including profit and settings.',
    rank: 1,
    isProtected: true,
    permissions: ALL_PERMISSION_KEYS,
  },
  {
    key: 'manager',
    name: 'Project Manager',
    description: 'Runs projects and costs. Profit and margin are hidden unless the owner grants them.',
    rank: 2,
    isProtected: false,
    permissions: MANAGER_PERMISSIONS,
  },
  {
    key: 'finance',
    name: 'Finance',
    description: 'Billing, payments, expenses and tax depth.',
    rank: 3,
    isProtected: false,
    permissions: FINANCE_PERMISSIONS,
  },
  {
    key: 'worker',
    name: 'Worker',
    description: 'Records expenses and hours for assigned work. No financial totals.',
    rank: 4,
    isProtected: false,
    permissions: WORKER_PERMISSIONS,
  },
];

export function roleTemplate(key: RoleTemplateKey): RoleTemplate {
  const template = ROLE_TEMPLATES.find((candidate) => candidate.key === key);
  if (!template) throw new Error(`Unknown role template: ${key}`);
  return template;
}

/**
 * Permissions an owner may switch on or off per organization in V1. The full
 * role builder is deferred (H1), so everything else stays as seeded.
 */
export const TOGGLEABLE_PERMISSIONS: Readonly<Record<RoleTemplateKey, readonly PermissionKey[]>> = {
  owner: [],
  manager: [PERMISSIONS.PROJECT_PROFIT_READ, PERMISSIONS.BILLING_MANAGE, PERMISSIONS.INVITATIONS_MANAGE],
  finance: [PERMISSIONS.PROJECT_PROFIT_READ, PERMISSIONS.CONTRACTS_MANAGE],
  worker: [PERMISSIONS.TIME_MANAGE, PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.VENDORS_READ],
};
