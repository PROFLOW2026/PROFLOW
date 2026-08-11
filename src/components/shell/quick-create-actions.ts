import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { QuickCreateEmphasisKey, SuggestedBusinessDefaults, WorkMix } from '@/modules/tenancy';
import { orderQuickCreateActions, workMixSurfacesJobs } from '@/modules/tenancy';
import type { QuickCreateAction } from './quick-create';

export type CreateWorkKind = SuggestedBusinessDefaults['defaultWorkKind'];

export interface CreateWorkKindOption {
  readonly kind: CreateWorkKind;
  readonly href: string;
  readonly key: 'project' | 'job' | 'service';
}

const WORK_KIND_TO_ACTION_KEY = {
  project: 'project',
  job: 'job',
  work_order: 'service',
} as const;

/** Quick Create action key for a business-profile default work kind. */
export function quickCreateKeyForWorkKind(kind: CreateWorkKind): 'project' | 'job' | 'service' {
  return WORK_KIND_TO_ACTION_KEY[kind];
}

/**
 * Pin the profile default work-type action first when it is already in the list.
 * Does not invent destinations the org cannot use.
 */
export function pinDefaultWorkKindFirst<T extends { key: string }>(
  actions: readonly T[],
  defaultWorkKind?: CreateWorkKind | null,
): T[] {
  if (!defaultWorkKind) return [...actions];
  const key = quickCreateKeyForWorkKind(defaultWorkKind);
  const index = actions.findIndex((action) => action.key === key);
  if (index <= 0) return [...actions];
  const next = [...actions];
  const pinned = next.splice(index, 1)[0];
  if (!pinned) return next;
  next.unshift(pinned);
  return next;
}

function jobsCreateVisible(
  modules: Record<string, boolean>,
  workMix: WorkMix,
  defaultWorkKind?: CreateWorkKind | null,
): boolean {
  return (
    Boolean(modules.jobs) ||
    workMixSurfacesJobs(workMix) ||
    defaultWorkKind === 'job'
  );
}

/** Work-type create destinations this org can actually open. */
export function listAvailableCreateWorkKinds(
  permissions: ReadonlySet<string>,
  modules: Record<string, boolean>,
  workMix: WorkMix,
  suggestedDefaults?: SuggestedBusinessDefaults | null,
): CreateWorkKindOption[] {
  const options: CreateWorkKindOption[] = [];
  const canCreateWork = permissions.has(PERMISSIONS.PROJECTS_CREATE);
  const defaultWorkKind = suggestedDefaults?.defaultWorkKind;

  if (canCreateWork) {
    options.push({ kind: 'project', href: '/projects/new', key: 'project' });
    if (jobsCreateVisible(modules, workMix, defaultWorkKind)) {
      options.push({ kind: 'job', href: '/jobs/new', key: 'job' });
    }
  }

  if (modules.service && permissions.has(PERMISSIONS.SERVICE_MANAGE)) {
    options.push({ kind: 'work_order', href: '/work-orders/new', key: 'service' });
  }

  return options;
}

/**
 * Permission- and module-aware Quick Create destinations.
 * Keep this short: daily field/office capture only — not compensation,
 * allocation, OCR, or every module's "new" page.
 *
 * `suggestedDefaults.defaultWorkKind` wins the first slot when that action
 * is allowed. Emphasis still orders the rest. Manual override stays in the menu.
 */
export function buildQuickCreateActions(
  permissions: ReadonlySet<string>,
  modules: Record<string, boolean>,
  workMix: WorkMix,
  emphasis?: readonly QuickCreateEmphasisKey[] | null,
  suggestedDefaults?: SuggestedBusinessDefaults | null,
): QuickCreateAction[] {
  const actions: QuickCreateAction[] = [];
  const canCreateWork = permissions.has(PERMISSIONS.PROJECTS_CREATE);
  const defaultWorkKind = suggestedDefaults?.defaultWorkKind;
  const jobsVisible = jobsCreateVisible(modules, workMix, defaultWorkKind);

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

  if (
    permissions.has(PERMISSIONS.EXPENSES_CREATE) ||
    permissions.has(PERMISSIONS.AP_MANAGE) ||
    permissions.has(PERMISSIONS.BILLING_MANAGE)
  ) {
    actions.push({
      key: 'recurringDrafts',
      href: '/recurring-drafts/new',
      labelKey: 'recurringDrafts',
    });
  }

  const ordered = orderQuickCreateActions(actions, emphasis);
  return pinDefaultWorkKindFirst(ordered, defaultWorkKind);
}
