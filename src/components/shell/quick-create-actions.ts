import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { QuickCreateEmphasisKey, WorkMix } from '@/modules/tenancy';
import { orderQuickCreateActions, workMixSurfacesJobs } from '@/modules/tenancy';
import type { QuickCreateAction } from './quick-create';

/**
 * Permission- and module-aware Quick Create destinations.
 * Keep this short: daily field/office capture only — not compensation,
 * allocation, OCR, or every module's "new" page.
 */
export function buildQuickCreateActions(
  permissions: ReadonlySet<string>,
  modules: Record<string, boolean>,
  workMix: WorkMix,
  emphasis?: readonly QuickCreateEmphasisKey[] | null,
): QuickCreateAction[] {
  const actions: QuickCreateAction[] = [];
  const canCreateWork = permissions.has(PERMISSIONS.PROJECTS_CREATE);
  const jobsVisible = Boolean(modules.jobs) || workMixSurfacesJobs(workMix);

  if (canCreateWork) {
    const jobAction = { key: 'job', href: '/jobs/new', labelKey: 'job' } as const;
    const projectAction = { key: 'project', href: '/projects/new', labelKey: 'project' } as const;
    if (workMix === 'jobs') {
      if (jobsVisible) actions.push(jobAction);
      actions.push(projectAction);
    } else if (workMix === 'mixed') {
      if (jobsVisible) actions.push(jobAction);
      actions.push(projectAction);
    } else {
      actions.push(projectAction);
      if (jobsVisible) actions.push(jobAction);
    }
  }

  if (permissions.has(PERMISSIONS.EXPENSES_CREATE)) {
    actions.push({ key: 'expense', href: '/expenses/new', labelKey: 'expense' });
  }
  if (modules.changes && permissions.has(PERMISSIONS.CHANGES_MANAGE)) {
    actions.push({ key: 'change', href: '/changes/new', labelKey: 'change' });
  }
  if (modules.quotes && permissions.has(PERMISSIONS.QUOTES_MANAGE)) {
    actions.push({ key: 'quote', href: '/quotes/new', labelKey: 'quote' });
  }
  if (modules.billing && permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    actions.push({ key: 'billingRecord', href: '/billing/new', labelKey: 'billingRecord' });
    actions.push({ key: 'payment', href: '/billing/payments/new', labelKey: 'payment' });
  }
  if (modules.clients && permissions.has(PERMISSIONS.CLIENTS_MANAGE)) {
    actions.push({ key: 'client', href: '/clients/new', labelKey: 'client' });
  }
  if (modules.vendors && permissions.has(PERMISSIONS.VENDORS_MANAGE)) {
    actions.push({ key: 'vendor', href: '/vendors/new', labelKey: 'vendor' });
  }
  if (permissions.has(PERMISSIONS.WORKFORCE_MANAGE)) {
    actions.push({ key: 'employee', href: '/workforce/employees/new', labelKey: 'employee' });
  }
  if (permissions.has(PERMISSIONS.TIME_MANAGE)) {
    actions.push({ key: 'timeEntry', href: '/workforce/time/new', labelKey: 'timeEntry' });
  }

  // Field daily capture — module-gated like Field Ops nav.
  if (modules.field_ops && permissions.has(PERMISSIONS.FIELD_OPS_MANAGE)) {
    actions.push({ key: 'fieldLog', href: '/field-ops/logs/new', labelKey: 'fieldLog' });
  }

  // Documents: no standalone /documents/new — upload lives on entity panels.
  // Skip Quick Create until a dedicated capture route exists.

  // Assets / maintenance hub create (maintenance lines still need an asset).
  if (modules.assets && permissions.has(PERMISSIONS.ASSETS_MANAGE)) {
    actions.push({ key: 'maintenance', href: '/assets/new', labelKey: 'maintenance' });
  }

  // Permission-only (same discoverability rule as Vendor bills nav).
  if (permissions.has(PERMISSIONS.AP_MANAGE)) {
    actions.push({ key: 'vendorBill', href: '/procurement/ap/new', labelKey: 'vendorBill' });
  }

  if (
    permissions.has(PERMISSIONS.ATTENDANCE_MANAGE) ||
    permissions.has(PERMISSIONS.ATTENDANCE_SELF)
  ) {
    actions.push({
      key: 'attendance',
      href: '/workforce/attendance',
      labelKey: 'attendance',
    });
  }

  // Next-gen surfaces — only when module is visible and permission exists.
  if (modules.service && permissions.has(PERMISSIONS.SERVICE_MANAGE)) {
    actions.push({ key: 'service', href: '/work-orders/new', labelKey: 'service' });
  }

  return orderQuickCreateActions(actions, emphasis);
}
