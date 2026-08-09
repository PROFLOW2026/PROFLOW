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
  | 'tax'
  | 'activity'
  | 'profile';

export interface SettingsSection {
  readonly key: SettingsSectionKey;
  readonly href: string;
  readonly permission: PermissionKey | null;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { key: 'business', href: '/settings/business', permission: PERMISSIONS.ORG_READ },
  { key: 'people', href: '/settings/people', permission: PERMISSIONS.MEMBERS_READ },
  { key: 'roles', href: '/settings/roles', permission: PERMISSIONS.ROLES_MANAGE },
  { key: 'features', href: '/settings/features', permission: PERMISSIONS.SETTINGS_MANAGE },
  { key: 'costCategories', href: '/settings/cost-categories', permission: PERMISSIONS.SETTINGS_MANAGE },
  { key: 'tax', href: '/settings/tax', permission: PERMISSIONS.TAX_MANAGE },
  { key: 'activity', href: '/settings/activity', permission: PERMISSIONS.AUDIT_READ },
  { key: 'profile', href: '/settings/profile', permission: null },
];

export function canAccessSection(context: OrgContext, section: SettingsSection): boolean {
  if (!section.permission) return true;
  return hasPermission(context, section.permission);
}

export function accessibleSections(context: OrgContext): SettingsSection[] {
  return SETTINGS_SECTIONS.filter((section) => canAccessSection(context, section));
}

export function canManageSection(context: OrgContext, sectionKey: SettingsSectionKey): boolean {
  switch (sectionKey) {
    case 'business':
      return hasPermission(context, PERMISSIONS.ORG_UPDATE);
    case 'people':
      return hasPermission(context, PERMISSIONS.MEMBERS_MANAGE);
    case 'roles':
      return hasPermission(context, PERMISSIONS.ROLES_MANAGE);
    case 'features':
    case 'costCategories':
      return hasPermission(context, PERMISSIONS.SETTINGS_MANAGE);
    case 'tax':
      return hasPermission(context, PERMISSIONS.TAX_MANAGE);
    case 'activity':
    case 'profile':
      return false;
    default:
      return false;
  }
}
