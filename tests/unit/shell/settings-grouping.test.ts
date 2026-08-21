import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import {
  SETTINGS_NAV_GROUP_ORDER,
  SETTINGS_SECTIONS,
  accessibleSections,
  canAccessSection,
  groupSettingsSections,
} from '@/app/[locale]/(app)/settings/_lib/access';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('settings section grouping', () => {
  it('orders listed sections and assigns nav groups', () => {
    const listed = SETTINGS_SECTIONS.filter((section) => !section.hideFromNav);
    expect(listed.map((section) => section.key)).toEqual([
      'business',
      'branding',
      'people',
      'profile',
      'tax',
      'numbering',
      'app',
      'approvals',
      'features',
      'costCategories',
      'businessCatalogs',
      'templates',
      'catalog',
      'roles',
      'customFields',
      'forms',
      'activity',
      'offlineDrafts',
      'banking',
      'integrations',
      'api',
    ]);

    expect(listed.find((s) => s.key === 'business')?.group).toBe('basic');
    expect(listed.find((s) => s.key === 'branding')?.group).toBe('basic');
    expect(listed.find((s) => s.key === 'branding')?.href).toBe('/settings/branding');
    expect(listed.find((s) => s.key === 'features')?.group).toBe('business');
    expect(listed.find((s) => s.key === 'customFields')?.group).toBe('advanced');
    expect(listed.find((s) => s.key === 'api')?.group).toBe('developers');
  });

  it('hides portal from accessibleSections while keeping direct-URL access', () => {
    const context = contextWith([PERMISSIONS.PORTAL_MANAGE, PERMISSIONS.ORG_READ]);
    const portal = SETTINGS_SECTIONS.find((section) => section.key === 'portal')!;

    expect(portal.hideFromNav).toBe(true);
    expect(canAccessSection(context, portal)).toBe(true);
    expect(accessibleSections(context).some((section) => section.key === 'portal')).toBe(false);
    expect(accessibleSections(context).some((section) => section.key === 'business')).toBe(true);
  });

  it('keeps OCR out of the static listed nav until ingestion is enabled', () => {
    const ocr = SETTINGS_SECTIONS.find((section) => section.key === 'ocr')!;
    expect(ocr.hideFromNav).toBe(true);
    expect(ocr.href).toBe('/settings/ocr');
  });

  it('groups accessible sections in SETTINGS_NAV_GROUP_ORDER', () => {
    const context = contextWith([
      PERMISSIONS.ORG_READ,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.API_MANAGE,
      PERMISSIONS.CUSTOM_FIELDS_MANAGE,
    ]);
    const groups = groupSettingsSections(accessibleSections(context));

    expect(groups.map((entry) => entry.group)).toEqual(
      SETTINGS_NAV_GROUP_ORDER.filter((group) => groups.some((entry) => entry.group === group)),
    );
    expect(groups.find((entry) => entry.group === 'developers')?.items.map((i) => i.key)).toEqual([
      'api',
    ]);
    expect(groups.every((entry) => entry.items.every((item) => item.key !== 'portal'))).toBe(true);
  });
});
