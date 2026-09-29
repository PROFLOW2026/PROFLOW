import { PERMISSIONS } from '@/shared/permissions/catalog';
import type {
  ExperiencePersonaKey,
  QuickCreateEmphasisKey,
  SuggestedBusinessDefaults,
  WorkMix,
} from '@/modules/tenancy';
import { orderCanonicalQuickCreateActions, workMixSurfacesJobs } from '@/modules/tenancy';
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
 * Used by create-page hints only — not Quick Create menu ordering.
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
 * Fixed Owner-curated list (13 items max) — never persona-expanded.
 */
export function buildQuickCreateActions(
  permissions: ReadonlySet<string>,
  modules: Record<string, boolean>,
  workMix: WorkMix,
  _emphasis?: readonly QuickCreateEmphasisKey[] | null,
  suggestedDefaults?: SuggestedBusinessDefaults | null,
  _persona?: ExperiencePersonaKey | null,
): QuickCreateAction[] {
  const candidates: QuickCreateAction[] = [];
  const canCreateWork = permissions.has(PERMISSIONS.PROJECTS_CREATE);
  const jobsVisible = jobsCreateVisible(modules, workMix, suggestedDefaults?.defaultWorkKind);

  if (permissions.has(PERMISSIONS.DOCUMENTS_MANAGE)) {
    candidates.push({ key: 'quickCapture', href: '/quick-capture', labelKey: 'quickCapture' });
  }

  if (canCreateWork) {
    candidates.push({ key: 'project', href: '/projects/new', labelKey: 'project' });
    if (jobsVisible) {
      candidates.push({ key: 'job', href: '/jobs/new', labelKey: 'job' });
    }
  }

  if (modules.service && permissions.has(PERMISSIONS.SERVICE_MANAGE)) {
    candidates.push({ key: 'service', href: '/work-orders/new', labelKey: 'service' });
  }

  if (modules.quotes && permissions.has(PERMISSIONS.QUOTES_MANAGE)) {
    candidates.push({ key: 'quote', href: '/quotes/new', labelKey: 'quote' });
  }

  if (modules.clients && permissions.has(PERMISSIONS.CLIENTS_MANAGE)) {
    candidates.push({ key: 'client', href: '/clients/new', labelKey: 'client' });
  }

  if (permissions.has(PERMISSIONS.EXPENSES_CREATE)) {
    candidates.push({ key: 'expense', href: '/expenses', labelKey: 'expense' });
  }

  if (modules.vendors && permissions.has(PERMISSIONS.VENDORS_MANAGE)) {
    candidates.push({ key: 'vendor', href: '/vendors/new', labelKey: 'vendor' });
  }

  if (modules.billing && permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    candidates.push({ key: 'billingRecord', href: '/billing/new', labelKey: 'billingRecord' });
  }

  if (permissions.has(PERMISSIONS.WORKFORCE_MANAGE)) {
    candidates.push({ key: 'employee', href: '/workforce/employees/new', labelKey: 'employee' });
  }

  if (permissions.has(PERMISSIONS.TIME_MANAGE)) {
    candidates.push({ key: 'timeEntry', href: '/workforce/time/new', labelKey: 'timeEntry' });
  }

  if (modules.field_ops && permissions.has(PERMISSIONS.FIELD_OPS_MANAGE)) {
    candidates.push({ key: 'fieldLog', href: '/field-ops/logs/new', labelKey: 'fieldLog' });
  }

  if (modules.changes && permissions.has(PERMISSIONS.CHANGES_MANAGE)) {
    candidates.push({ key: 'change', href: '/changes/new', labelKey: 'change' });
  }

  return orderCanonicalQuickCreateActions(candidates);
}
