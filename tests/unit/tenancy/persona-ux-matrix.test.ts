/**
 * Acceptance matrix: preview personas must produce visibly different UX surfaces.
 * Config-level proof used alongside Owner render checks.
 */
import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  partitionNavItems,
  selectMobilePrimaryItems,
  visibleNavItems,
} from '@/components/shell/navigation';
import {
  CUSTOMER_FEATURE_MODULE_KEYS,
  OPTIONAL_MODULE_KEYS,
} from '@/modules/tenancy/domain/types';
import {
  PERSONA_DASHBOARD_CARDS,
  PERSONA_PRIMARY_NAV_KEYS,
  PERSONA_QUICK_CREATE_KEYS,
  PERSONA_TODAY_FOCUS,
  PROJECT_PROFILE_TAB_ALLOWLIST,
  limitQuickCreateForPersona,
  personaForBusinessProfile,
} from '@/modules/tenancy';
import type { ExperiencePersonaKey } from '@/modules/tenancy/domain/experience-persona';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

const OWNER_PERMISSIONS = new Set([
  PERMISSIONS.COMMAND_CENTER_READ,
  PERMISSIONS.PROJECTS_READ,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.CLIENTS_READ,
  PERMISSIONS.QUOTES_READ,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.SERVICE_READ,
  PERMISSIONS.DISPATCH_MANAGE,
  PERMISSIONS.WORKFORCE_READ,
  PERMISSIONS.TIME_MANAGE,
  PERMISSIONS.VENDORS_READ,
  PERMISSIONS.PROCUREMENT_READ,
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.FIELD_OPS_READ,
  PERMISSIONS.SAFETY_READ,
  PERMISSIONS.FORMS_READ,
  PERMISSIONS.PROJECT_FINANCIALS_READ,
  PERMISSIONS.CRM_READ,
  PERMISSIONS.CHANGES_READ,
  PERMISSIONS.MATERIALS_READ,
  PERMISSIONS.AP_READ,
  PERMISSIONS.SCHEDULING_READ,
]);

const PREVIEW_PROFILES = [
  'GENERAL_CONTRACTOR',
  'ELECTRICAL',
  'RENOVATION',
  'SMALL_WORKS',
  'FIELD_SERVICE',
  'ARCHITECT',
  'ENGINEERING_CONSULTANT',
  'SAFETY_INSPECTION_CONSULTANT',
  'MIXED_PROJECT_SERVICE',
  'ALL_CAPABILITIES',
] as const;

function surfaceFingerprint(persona: ExperiencePersonaKey) {
  const profile = PREVIEW_PROFILES.find((key) => personaForBusinessProfile(key) === persona);
  const workMix = profile ? (getBusinessProfile(profile)?.workMix ?? 'projects') : 'projects';
  const modules = allModulesOn();
  if (persona !== 'all') {
    const recommended = profile ? getBusinessProfile(profile)?.visibleModules : null;
    if (recommended) {
      for (const key of OPTIONAL_MODULE_KEYS) {
        modules[key] = false;
      }
      for (const key of recommended) modules[key] = true;
    }
  }

  const items = visibleNavItems(OWNER_PERMISSIONS, modules, {
    workMix,
    persona,
    roleSurface: 'owner',
  });
  const { core, groups } = partitionNavItems(items);
  const mobile = selectMobilePrimaryItems(items);
  const qc = limitQuickCreateForPersona(
    [
      { key: 'project' },
      { key: 'job' },
      { key: 'service' },
      { key: 'quote' },
      { key: 'expense' },
      { key: 'client' },
      { key: 'vendorBill' },
      { key: 'fieldLog' },
      { key: 'change' },
      { key: 'timeEntry' },
      { key: 'billingRecord' },
      { key: 'attendance' },
    ],
    persona,
  );

  return {
    persona,
    coreKeys: core.map((item) => item.key),
    groupKeys: groups.map((entry) => entry.group),
    groupSizes: Object.fromEntries(groups.map((entry) => [entry.group, entry.items.length])),
    mobileKeys: mobile.map((item) => item.key),
    dashboardCards: [...PERSONA_DASHBOARD_CARDS[persona]],
    todayFocus: [...PERSONA_TODAY_FOCUS[persona]],
    quickCreate: qc.map((action) => action.key),
    primaryNav: [...PERSONA_PRIMARY_NAV_KEYS[persona]],
  };
}

describe('persona UX acceptance matrix', () => {
  it('maps each Owner preview profile to a distinct persona family', () => {
    const personas = PREVIEW_PROFILES.map((key) => personaForBusinessProfile(key));
    expect(new Set(personas).size).toBeGreaterThanOrEqual(8);
  });

  it('produces materially different nav / dashboard / today / quick-create / mobile per persona', () => {
    const personas: ExperiencePersonaKey[] = [
      'project_contractor',
      'small_works',
      'service',
      'consulting',
      'inspection',
      'all',
    ];
    const fingerprints = personas.map(surfaceFingerprint);
    const signatures = fingerprints.map((fp) =>
      JSON.stringify({
        core: fp.coreKeys,
        groups: fp.groupKeys,
        mobile: fp.mobileKeys,
        cards: fp.dashboardCards,
        today: fp.todayFocus,
        qc: fp.quickCreate,
      }),
    );
    expect(new Set(signatures).size).toBe(signatures.length);

    const contractor = fingerprints.find((fp) => fp.persona === 'project_contractor')!;
    const small = fingerprints.find((fp) => fp.persona === 'small_works')!;
    const service = fingerprints.find((fp) => fp.persona === 'service')!;
    const consulting = fingerprints.find((fp) => fp.persona === 'consulting')!;

    expect(contractor.coreKeys).toEqual(
      expect.arrayContaining(['dashboard', 'today', 'projects']),
    );
    expect(small.coreKeys).toEqual(expect.arrayContaining(['dashboard', 'today', 'jobs']));
    expect(service.coreKeys).toEqual(
      expect.arrayContaining(['dashboard', 'today', 'workOrders']),
    );
    expect(consulting.quickCreate).toEqual(
      expect.arrayContaining(['client', 'quote', 'project', 'timeEntry']),
    );
    expect(consulting.quickCreate).not.toContain('vendorBill');
    expect(contractor.dashboardCards).toEqual(
      expect.arrayContaining(['contractValue', 'profit', 'commitments']),
    );
    expect(small.dashboardCards).toContain('firstActions');
    expect(small.dashboardCards).not.toContain('contractValue');
    expect(service.dashboardCards).toContain('serviceToday');
    expect(service.todayFocus).toContain('service');
    expect(contractor.todayFocus).toContain('boq');
    expect(consulting.todayFocus).toContain('time_people');
    expect(service.mobileKeys).toContain('workOrders');
    expect(PERSONA_QUICK_CREATE_KEYS.small_works.length).toBeLessThanOrEqual(6);
    expect(PERSONA_QUICK_CREATE_KEYS.consulting.length).toBeLessThanOrEqual(6);
  });

  it('keeps project tab allowlists visibly different across experience profiles', () => {
    expect([...PROJECT_PROFILE_TAB_ALLOWLIST.simple]).not.toContain('boq');
    expect([...PROJECT_PROFILE_TAB_ALLOWLIST.simple]).not.toContain('financials');
    expect([...PROJECT_PROFILE_TAB_ALLOWLIST.consulting]).toContain('time');
    expect([...PROJECT_PROFILE_TAB_ALLOWLIST.boq]).toEqual(
      expect.arrayContaining(['boq', 'budgets', 'changes', 'closeout']),
    );
    expect(PROJECT_PROFILE_TAB_ALLOWLIST.simple.size).toBeLessThan(
      PROJECT_PROFILE_TAB_ALLOWLIST.full.size,
    );
  });

  it('preserves customer capability parity (portal excluded by design)', () => {
    expect(CUSTOMER_FEATURE_MODULE_KEYS.length).toBeGreaterThan(10);
    expect(CUSTOMER_FEATURE_MODULE_KEYS).not.toContain('portal');
    const allPersona = surfaceFingerprint('all');
    expect(allPersona.dashboardCards.length).toBeGreaterThan(
      surfaceFingerprint('small_works').dashboardCards.length,
    );
    expect(allPersona.quickCreate.length).toBeGreaterThan(
      surfaceFingerprint('consulting').quickCreate.length,
    );
  });

  it('does not leave empty groups in partitioned nav for major personas', () => {
    for (const persona of [
      'project_contractor',
      'small_works',
      'service',
      'consulting',
    ] as const) {
      const fp = surfaceFingerprint(persona);
      expect(fp.groupKeys.length).toBeGreaterThan(0);
      for (const size of Object.values(fp.groupSizes)) {
        expect(size).toBeGreaterThan(0);
      }
    }
  });
});

// Keep NAV_ITEMS import live for orphan-destination sanity.
describe('nav catalog integrity', () => {
  it('registers a finite destination catalog', () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(15);
  });
});
