import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { BUSINESS_PROFILE_SETTING_KEY } from '@/modules/tenancy/domain/business-profiles';
import { CAPABILITY_MODE_SETTING_KEY } from '@/modules/tenancy/domain/capability-overrides';
import {
  EXPERIENCE_FAMILY_SETTING_KEY,
  EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
} from '@/modules/tenancy/domain/experience-family';
import {
  resetExperienceUiOverridesAction,
  saveExperienceSettingsAction,
} from '@/modules/tenancy/application/save-experience-settings';

const upsertOrganizationSettingValue = vi.fn();
const applyBusinessProfileConfig = vi.fn();
const loadShellOrgSettings = vi.fn();

vi.mock('@/modules/tenancy/data/organization-settings.repository', () => ({
  upsertOrganizationSettingValue: (...args: unknown[]) => upsertOrganizationSettingValue(...args),
}));

vi.mock('@/modules/tenancy/application/apply-business-profile', () => ({
  applyBusinessProfileConfig: (...args: unknown[]) => applyBusinessProfileConfig(...args),
}));

vi.mock('@/modules/tenancy/application/shell-org-settings', () => ({
  loadShellOrgSettings: (...args: unknown[]) => loadShellOrgSettings(...args),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/app/[locale]/(app)/settings/_lib/access', () => ({
  canManageSection: () => true,
}));

const orgContext: OrgContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  membershipId: 'membership-1',
  organization: {
    id: 'org-1',
    name: 'Test Org',
    baseCurrency: 'ILS',
    timezone: 'Asia/Jerusalem',
    countryCode: 'IL',
    defaultLocale: 'he-IL',
  },
  permissions: new Set(),
  roleKeys: [],
  db: {} as OrgContext['db'],
  locale: 'he-IL',
};

vi.mock('@/shared/auth/session', () => ({
  withOrgContext: async (fn: (ctx: OrgContext) => Promise<void>) => fn(orgContext),
}));

function upsertKeys(): string[] {
  return upsertOrganizationSettingValue.mock.calls.map((call) => call[2] as string);
}

describe('saveExperienceSettingsAction', () => {
  beforeEach(() => {
    upsertOrganizationSettingValue.mockReset();
    applyBusinessProfileConfig.mockReset();
    loadShellOrgSettings.mockReset();
    upsertOrganizationSettingValue.mockResolvedValue(undefined);
    loadShellOrgSettings.mockResolvedValue({ experienceUiOverrides: { 'owner.apOutstanding': false } });
  });

  it('persists experience settings only — never applies business profile or modules', async () => {
    const data = new FormData();
    data.set('family', 'all_capabilities');
    data.set('capabilityMode', 'all');
    data.set('overridesJson', JSON.stringify({ 'owner.kpiRow': false }));

    const result = await saveExperienceSettingsAction(data);
    expect(result).toEqual({ ok: true });
    expect(applyBusinessProfileConfig).not.toHaveBeenCalled();
    expect(upsertKeys()).toEqual([
      EXPERIENCE_FAMILY_SETTING_KEY,
      CAPABILITY_MODE_SETTING_KEY,
      EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
    ]);
    expect(upsertKeys()).not.toContain(BUSINESS_PROFILE_SETTING_KEY);
  });

  it('family switch with profile mode does not touch business_profile', async () => {
    const data = new FormData();
    data.set('family', 'engineering_consulting_architecture');
    data.set('capabilityMode', 'profile');
    data.set('overridesJson', '{}');

    await saveExperienceSettingsAction(data);
    expect(applyBusinessProfileConfig).not.toHaveBeenCalled();
    expect(upsertOrganizationSettingValue).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      EXPERIENCE_FAMILY_SETTING_KEY,
      'engineering_consulting_architecture',
    );
  });

  it('reset UI clears overrides without module writes', async () => {
    const data = new FormData();
    data.set('family', 'project_contracting');
    data.set('capabilityMode', 'custom');
    data.set('resetUi', '1');

    await saveExperienceSettingsAction(data);
    expect(applyBusinessProfileConfig).not.toHaveBeenCalled();
    expect(upsertOrganizationSettingValue).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
      {},
    );
  });

  it('merges custom toggles into existing overrides', async () => {
    const data = new FormData();
    data.set('family', 'custom');
    data.set('capabilityMode', 'custom');
    data.set('overridesJson', JSON.stringify({ 'owner.kpiRow': false }));

    await saveExperienceSettingsAction(data);
    expect(upsertOrganizationSettingValue).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
      { 'owner.apOutstanding': false, 'owner.kpiRow': false },
    );
  });
});

describe('resetExperienceUiOverridesAction', () => {
  beforeEach(() => {
    upsertOrganizationSettingValue.mockReset();
    applyBusinessProfileConfig.mockReset();
    upsertOrganizationSettingValue.mockResolvedValue(undefined);
  });

  it('clears UI overrides only', async () => {
    await resetExperienceUiOverridesAction();
    expect(applyBusinessProfileConfig).not.toHaveBeenCalled();
    expect(upsertOrganizationSettingValue).toHaveBeenCalledTimes(1);
    expect(upsertOrganizationSettingValue).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
      {},
    );
  });
});
