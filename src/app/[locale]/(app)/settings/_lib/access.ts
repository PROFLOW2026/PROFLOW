import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';

export type SettingsSectionKey =
  | 'business'
  | 'people'
  | 'roles'
  | 'features'
  | 'costCategories'
  | 'catalog'
  | 'templates'
  | 'tax'
  | 'numbering'
  | 'approvals'
  | 'portal'
  | 'customFields'
  | 'forms'
  | 'api'
  | 'activity'
  | 'app'
  | 'offlineDrafts'
  | 'banking'
  | 'profile';

export type SettingsNavGroup = 'basic' | 'business' | 'advanced' | 'developers';

export interface SettingsSection {
  readonly key: SettingsSectionKey;
  readonly href: string;
  readonly permission: PermissionKey | null;
  readonly group: SettingsNavGroup;
  /** Hidden from normal Settings nav (route may still exist). */
  readonly hideFromNav?: boolean;
}

/**
 * Settings IA: BASIC → BUSINESS CONFIG → ADVANCED → DEVELOPERS.
 * Portal foundation is not listed for normal customers.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: 'business', href: '/settings/business', permission: PERMISSIONS.ORG_READ, group: 'basic' },
  { key: 'people', href: '/settings/people', permission: PERMISSIONS.MEMBERS_READ, group: 'basic' },
  { key: 'profile', href: '/settings/profile', permission: null, group: 'basic' },
  { key: 'tax', href: '/settings/tax', permission: PERMISSIONS.TAX_MANAGE, group: 'basic' },
  { key: 'numbering', href: '/settings/numbering', permission: PERMISSIONS.ORG_READ, group: 'basic' },
  { key: 'app', href: '/settings/app', permission: null, group: 'basic' },

  { key: 'approvals', href: '/settings/approvals', permission: PERMISSIONS.APPROVALS_MANAGE, group: 'business' },
  { key: 'features', href: '/settings/features', permission: PERMISSIONS.SETTINGS_MANAGE, group: 'business' },
  { key: 'costCategories', href: '/settings/cost-categories', permission: PERMISSIONS.SETTINGS_MANAGE, group: 'business' },
  { key: 'templates', href: '/settings/templates', permission: PERMISSIONS.SETTINGS_MANAGE, group: 'business' },
  { key: 'catalog', href: '/settings/catalog', permission: PERMISSIONS.SETTINGS_MANAGE, group: 'business' },
  { key: 'roles', href: '/settings/roles', permission: PERMISSIONS.ROLES_MANAGE, group: 'business' },

  { key: 'customFields', href: '/settings/custom-fields', permission: PERMISSIONS.CUSTOM_FIELDS_MANAGE, group: 'advanced' },
  { key: 'forms', href: '/settings/forms', permission: PERMISSIONS.FORMS_MANAGE, group: 'advanced' },
  { key: 'activity', href: '/settings/activity', permission: PERMISSIONS.AUDIT_READ, group: 'advanced' },
  { key: 'offlineDrafts', href: '/settings/offline-drafts', permission: null, group: 'advanced' },
  { key: 'banking', href: '/settings/banking', permission: PERMISSIONS.BANKING_READ, group: 'advanced' },

  { key: 'api', href: '/settings/api', permission: PERMISSIONS.API_MANAGE, group: 'developers' },

  // Foundation only — not in customer Settings nav
  {
    key: 'portal',
    href: '/settings/portal',
    permission: PERMISSIONS.PORTAL_MANAGE,
    group: 'developers',
    hideFromNav: true,
  },
];

export const SETTINGS_NAV_GROUP_ORDER: readonly SettingsNavGroup[] = [
  'basic',
  'business',
  'advanced',
  'developers',
];

export function canAccessSection(context: OrgContext, section: SettingsSection): boolean {
  if (!section.permission) return true;
  return hasPermission(context, section.permission);
}

export function accessibleSections(context: OrgContext): SettingsSection[] {
  return SETTINGS_SECTIONS.filter(
    (section) => !section.hideFromNav && canAccessSection(context, section),
  );
}

export function groupSettingsSections(
  sections: readonly SettingsSection[],
): { group: SettingsNavGroup; items: SettingsSection[] }[] {
  const result: { group: SettingsNavGroup; items: SettingsSection[] }[] = [];
  for (const group of SETTINGS_NAV_GROUP_ORDER) {
    const items = sections.filter((section) => section.group === group);
    if (items.length > 0) result.push({ group, items });
  }
  return result;
}

export function canManageSection(context: OrgContext, sectionKey: SettingsSectionKey): boolean {
  switch (sectionKey) {
    case 'business':
      return hasPermission(context, PERMISSIONS.ORG_UPDATE);
    case 'numbering':
      return hasPermission(context, PERMISSIONS.ORG_UPDATE);
    case 'people':
      return hasPermission(context, PERMISSIONS.MEMBERS_MANAGE);
    case 'roles':
      return hasPermission(context, PERMISSIONS.ROLES_MANAGE);
    case 'features':
    case 'costCategories':
    case 'catalog':
    case 'templates':
      return hasPermission(context, PERMISSIONS.SETTINGS_MANAGE);
    case 'tax':
      return hasPermission(context, PERMISSIONS.TAX_MANAGE);
    case 'approvals':
      return hasPermission(context, PERMISSIONS.APPROVALS_MANAGE);
    case 'portal':
      return hasPermission(context, PERMISSIONS.PORTAL_MANAGE);
    case 'customFields':
      return hasPermission(context, PERMISSIONS.CUSTOM_FIELDS_MANAGE);
    case 'forms':
      return hasPermission(context, PERMISSIONS.FORMS_MANAGE);
    case 'api':
      return hasPermission(context, PERMISSIONS.API_MANAGE);
    case 'banking':
      return hasPermission(context, PERMISSIONS.BANKING_MANAGE);
    case 'activity':
    case 'app':
    case 'offlineDrafts':
    case 'profile':
      return false;
    default:
      return false;
  }
}
