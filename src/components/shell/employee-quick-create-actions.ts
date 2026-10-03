import { orderCanonicalQuickCreateActions } from '@/modules/tenancy/domain/experience-quick-create';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { QuickCreateAction } from './quick-create';

/**
 * Org-level create destinations that already exist in the employee app.
 * Same permission the employee page asserts; owner module flags are not re-applied.
 */
const EMPLOYEE_ORG_QUICK_CREATE: readonly {
  readonly key: string;
  readonly labelKey: string;
  readonly permission: PermissionKey;
  readonly href: string;
}[] = [
  {
    key: 'project',
    labelKey: 'project',
    permission: PERMISSIONS.PROJECTS_CREATE,
    href: '/employee/projects/new',
  },
  {
    key: 'client',
    labelKey: 'client',
    permission: PERMISSIONS.CLIENTS_MANAGE,
    href: '/employee/clients/new',
  },
  {
    key: 'expense',
    labelKey: 'expense',
    permission: PERMISSIONS.EXPENSES_CREATE,
    href: '/employee/expenses/new',
  },
  {
    key: 'vendor',
    labelKey: 'vendor',
    permission: PERMISSIONS.VENDORS_MANAGE,
    href: '/employee/vendors/new',
  },
  {
    key: 'billingRecord',
    labelKey: 'billingRecord',
    permission: PERMISSIONS.BILLING_MANAGE,
    href: '/employee/billing/new',
  },
  {
    key: 'timeEntry',
    labelKey: 'timeEntry',
    permission: PERMISSIONS.TIME_MANAGE,
    href: '/employee/hours/new',
  },
];

export function buildEmployeeOrgQuickCreateActions(permissions: ReadonlySet<string>): QuickCreateAction[] {
  return orderCanonicalQuickCreateActions(
    EMPLOYEE_ORG_QUICK_CREATE.filter((spec) => permissions.has(spec.permission)).map((spec) => ({
      key: spec.key,
      labelKey: spec.labelKey,
      href: spec.href,
    })),
  );
}
