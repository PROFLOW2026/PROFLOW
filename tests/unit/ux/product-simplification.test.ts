import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';
import {
  NAV_ITEMS,
  partitionNavItems,
  visibleNavItems,
  type NavItemGroup,
} from '@/components/shell/navigation';
import { SETTINGS_SECTIONS, groupSettingsSections } from '@/app/[locale]/(app)/settings/_lib/access';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy';

const FORBIDDEN_HE_PATTERNS = [
  /OCR_PROVIDER_API_KEY/,
  /StubOcrProvider/i,
  /לחילוץ/,
  /מיגרציה\s*0011/,
  /Migration\s*0011/i,
  /portal_kind/,
  /contracts:read/,
  /project_profit:read/,
  /audit\.read/,
  /GET\s*\/api\/v1/i,
  /Bearer\b/,
  /התאמת AP/,
  /Change Order/,
  /פרוספקט/,
];

const CUSTOMER_NAMESPACES = [
  'nav',
  'common',
  'dashboard',
  'projects',
  'jobs',
  'expenses',
  'financial',
  'billing',
  'changes',
  'clients',
  'crm',
  'vendors',
  'workforce',
  'documents',
  'procurement',
  'ap',
  'exports',
  'settings',
  'assets',
  'compliance',
  'fieldOps',
  'customFields',
  'status',
  'tax',
  'organization',
] as const;

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

describe('authenticated product simplification', () => {
  it('he-IL customer catalogs have no known technical leakage strings', () => {
    const hits: string[] = [];
    for (const ns of CUSTOMER_NAMESPACES) {
      const flat = flattenLocaleCatalog(readLocaleCatalog('he-IL', ns));
      for (const [key, message] of flat) {
        for (const pattern of FORBIDDEN_HE_PATTERNS) {
          if (pattern.test(message)) {
            hits.push(`${ns}.${key}: ${message}`);
          }
        }
        if (/\bAP\b/.test(message)) {
          hits.push(`${ns}.${key} contains AP: ${message}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('glossary presentation terms are present in financial he-IL', () => {
    const financial = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'financial'));
    expect(financial.get('contractValue')).toBe('סכום חוזה');
    expect(financial.get('metricNature.committed')).toBe('התחייבויות');
    expect(financial.get('actualCostToDate')).toMatch(/עלות/);
    expect(financial.get('outstanding')).toMatch(/יתרה/);
    expect(financial.get('openApPayable')).not.toMatch(/\bAP\b/);
  });

  it('CRM Hebrew stages use owner-approved won/lost wording', () => {
    const crm = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'crm'));
    expect(crm.get('stages.won')).toBe('נסגר בהצלחה');
    expect(crm.get('stages.lost')).toBe('לא נסגר');
    expect(crm.get('statuses.opportunity.won')).toBe('נסגר בהצלחה');
    expect(crm.get('statuses.opportunity.lost')).toBe('לא נסגר');
  });

  it('procurement AP tab is labeled vendor bills in Hebrew', () => {
    const procurement = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'procurement'));
    expect(procurement.get('nav.ap')).toBe('חשבוניות ספק');
    expect(procurement.get('nav.ap')).not.toMatch(/AP/);
  });

  it('More menu groups CORE overflow into experience groups', () => {
    const allPerms = new Set(Object.values(PERMISSIONS));
    const visible = visibleNavItems(allPerms, allModulesOn(), {
      persona: 'project_contractor',
      roleSurface: 'owner',
    });
    const { groups } = partitionNavItems(visible);

    expect(groups.map((g: NavItemGroup) => g.group)).toEqual([
      'clients',
      'work',
      'people',
      'purchasing',
      'money',
      'field',
      'documents',
      'reports',
      'advanced',
    ]);
    expect(
      groups.find((g: NavItemGroup) => g.group === 'clients')?.items.map((i) => i.key),
    ).toEqual(expect.arrayContaining(['quotes']));
    expect(
      groups.find((g: NavItemGroup) => g.group === 'purchasing')?.items.map((i) => i.key),
    ).toEqual(expect.arrayContaining(['vendorBills']));
    expect(
      groups.find((g: NavItemGroup) => g.group === 'advanced')?.items.map((i) => i.key),
    ).toEqual(expect.arrayContaining(['assets', 'compliance', 'approvals', 'settings']));
    expect(
      groups.find((g: NavItemGroup) => g.group === 'money')?.items.map((i) => i.key),
    ).toEqual(expect.arrayContaining(['overhead', 'billing']));
    expect(NAV_ITEMS.some((item) => item.href === '/documents/ocr-review')).toBe(false);
  });

  it('Settings nav hides portal and api from static list; api appears with API_MANAGE', () => {
    expect(SETTINGS_SECTIONS.find((s) => s.key === 'portal')?.hideFromNav).toBe(true);
    expect(SETTINGS_SECTIONS.find((s) => s.key === 'api')?.hideFromNav).toBe(true);

    const listed = SETTINGS_SECTIONS.filter((s) => !s.hideFromNav);
    const grouped = groupSettingsSections(listed);
    expect(grouped.map((g) => g.group)).toEqual(['myBusiness', 'workflow', 'advanced']);
    expect(listed.some((s) => s.key === 'portal')).toBe(false);
    expect(listed.some((s) => s.key === 'api')).toBe(false);
  });

  it('nav locale catalogs include moreGroups, vendorBills, and jobs', () => {
    for (const locale of ['he-IL', 'en'] as const) {
      const nav = flattenLocaleCatalog(readLocaleCatalog(locale, 'nav'));
      expect(nav.has('moreGroups.business')).toBe(true);
      expect(nav.has('moreGroups.operations')).toBe(true);
      expect(nav.has('moreGroups.advanced')).toBe(true);
      expect(nav.has('vendorBills')).toBe(true);
      expect(nav.has('jobs')).toBe(true);
      expect(nav.has('overhead')).toBe(true);
      expect(nav.has('newMenu.job')).toBe(true);
    }
    const heNav = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'nav'));
    expect(heNav.get('vendorBills')).toBe('חשבוניות ספק');
    expect(heNav.get('jobs')).toBe('עבודות');
    expect(heNav.get('overhead')).toBe('הוצאות כלליות');
    expect(heNav.get('newMenu.job')).toBe('עבודה');
    expect(heNav.get('attendance')).toBe('נוכחות');
    expect(heNav.get('newMenu.fieldLog')).toBe('יומן עבודה');
    expect(heNav.get('newMenu.vendorBill')).toBe('חשבונית ספק');
    expect(heNav.get('newMenu.attendance')).toBe('נוכחות');
    expect(heNav.get('newMenu.maintenance')).toBe('ציוד / תחזוקה');
  });

  it('settings locale catalogs include group labels', () => {
    const he = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'settings'));
    const en = flattenLocaleCatalog(readLocaleCatalog('en', 'settings'));
    expect(he.get('groups.myBusiness')).toBe('העסק שלי');
    expect(he.get('groups.workflow')).toBe('איך עובדים');
    expect(he.get('groups.advanced')).toBe('מתקדם');
    expect(he.get('groups.developers')).toBe('מפתחים');
    expect(en.get('groups.myBusiness')).toBe('My business');
    expect(en.get('groups.workflow')).toBe('How we work');
    expect(en.get('groups.developers')).toBe('Developers');
  });
});

describe('he-IL locale file scan (non-marketing)', () => {
  it('no forbidden substrings in any he-IL json except marketing', () => {
    const dir = join(process.cwd(), 'src', 'locales', 'he-IL');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'marketing.json');
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      for (const pattern of [
        /OCR_PROVIDER_API_KEY/,
        /מיגרציה\s*0011/,
        /portal_kind/,
        /contracts:read/,
        /התאמת AP/,
        /Change Order/,
      ]) {
        if (pattern.test(text)) hits.push(`${file} matches ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
