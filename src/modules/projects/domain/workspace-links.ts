/**
 * Progressive Project Workspace overview links (doc 45).
 * Only surfaces areas the org enabled and the viewer can open.
 */

import type { OptionalModuleKey } from '@/modules/tenancy';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

export type ProjectWorkspaceLinkKey =
  | 'overview'
  | 'financials'
  | 'expenses'
  | 'changes'
  | 'billing'
  | 'budgets'
  | 'work'
  | 'team'
  | 'time'
  | 'documents'
  | 'details'
  | 'schedule'
  | 'procurement'
  | 'ap'
  | 'field_ops'
  | 'workforce'
  | 'vendors'
  | 'assets'
  | 'compliance';

export interface ProjectWorkspaceLink {
  readonly key: ProjectWorkspaceLinkKey;
  /** In-app path (locale-agnostic). */
  readonly href: string;
  /** When true, target is a project tab rather than a module list. */
  readonly inProject: boolean;
}

export interface WorkspaceLinkInput {
  readonly projectId: string;
  readonly modules: Partial<Record<OptionalModuleKey, boolean>>;
  readonly permissions: ReadonlySet<string> | ReadonlySet<PermissionKey>;
  readonly showWorkPackages: boolean;
  readonly canReadFinancials: boolean;
}

function can(permissions: WorkspaceLinkInput['permissions'], key: PermissionKey): boolean {
  return permissions.has(key);
}

function moduleOn(
  modules: WorkspaceLinkInput['modules'],
  key: OptionalModuleKey,
): boolean {
  return Boolean(modules[key]);
}

/**
 * Ordered workspace shortcuts for the project overview.
 * Mirrors project-tab business priority: daily ops → time/docs → setup.
 */
export function selectProjectWorkspaceLinks(input: WorkspaceLinkInput): ProjectWorkspaceLink[] {
  const { projectId } = input;
  const tab = (key: string) => `/projects/${projectId}?tab=${key}`;
  const links: ProjectWorkspaceLink[] = [
    { key: 'overview', href: `/projects/${projectId}`, inProject: true },
  ];

  if (input.canReadFinancials) {
    links.push({ key: 'financials', href: tab('financials'), inProject: true });
  }

  if (can(input.permissions, PERMISSIONS.EXPENSES_READ)) {
    links.push({ key: 'expenses', href: tab('expenses'), inProject: true });
  }

  if (moduleOn(input.modules, 'changes') && can(input.permissions, PERMISSIONS.CHANGES_READ)) {
    links.push({ key: 'changes', href: tab('changes'), inProject: true });
  }

  if (moduleOn(input.modules, 'billing') && can(input.permissions, PERMISSIONS.BILLING_READ)) {
    links.push({ key: 'billing', href: tab('billing'), inProject: true });
  }

  if (moduleOn(input.modules, 'budgets') && can(input.permissions, PERMISSIONS.BUDGETS_READ)) {
    links.push({ key: 'budgets', href: tab('budgets'), inProject: true });
  }

  if (can(input.permissions, PERMISSIONS.WORKFORCE_READ)) {
    links.push({ key: 'team', href: tab('team'), inProject: true });
  }

  // Permission-only (like workforce): `planning` is not in OPTIONAL_MODULE_KEYS.
  if (can(input.permissions, PERMISSIONS.PLANNING_READ)) {
    links.push({ key: 'schedule', href: tab('schedule'), inProject: true });
  }

  if (can(input.permissions, PERMISSIONS.WORKFORCE_READ)) {
    links.push(
      { key: 'time', href: tab('time'), inProject: true },
      {
        key: 'workforce',
        href: `/workforce/employees`,
        inProject: false,
      },
    );
  }

  if (moduleOn(input.modules, 'documents') && can(input.permissions, PERMISSIONS.DOCUMENTS_READ)) {
    links.push({ key: 'documents', href: tab('documents'), inProject: true });
  }

  if (input.showWorkPackages) {
    links.push({ key: 'work', href: tab('work'), inProject: true });
  }

  links.push({ key: 'details', href: tab('details'), inProject: true });

  if (
    moduleOn(input.modules, 'procurement') &&
    can(input.permissions, PERMISSIONS.PROCUREMENT_READ)
  ) {
    links.push({
      key: 'procurement',
      href: `/procurement?projectId=${projectId}`,
      inProject: false,
    });
  }

  if (moduleOn(input.modules, 'procurement') && can(input.permissions, PERMISSIONS.AP_READ)) {
    links.push({
      key: 'ap',
      href: `/procurement/ap?projectId=${projectId}`,
      inProject: false,
    });
  }

  if (moduleOn(input.modules, 'field_ops') && can(input.permissions, PERMISSIONS.FIELD_OPS_READ)) {
    links.push({
      key: 'field_ops',
      href: `/field-ops/logs?projectId=${projectId}`,
      inProject: false,
    });
  }

  if (moduleOn(input.modules, 'vendors') && can(input.permissions, PERMISSIONS.VENDORS_READ)) {
    links.push({ key: 'vendors', href: '/vendors', inProject: false });
  }

  if (moduleOn(input.modules, 'assets') && can(input.permissions, PERMISSIONS.ASSETS_READ)) {
    links.push({ key: 'assets', href: '/assets', inProject: false });
  }

  if (
    moduleOn(input.modules, 'compliance') &&
    can(input.permissions, PERMISSIONS.COMPLIANCE_READ)
  ) {
    links.push({ key: 'compliance', href: '/compliance', inProject: false });
  }

  return links;
}
