import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/shared/errors';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  LEGAL_IDENTITY_SETTING_KEY,
  parseOrganizationLegalIdentity,
  resolveOrganizationTaxId,
} from '@/modules/tenancy/domain/legal-identity';
import {
  saveOrganizationLegalIdentity,
  updateOrganizationLegalIdentity,
} from '@/modules/tenancy/application/legal-identity';

const upsertOrganizationSettingValue = vi.fn();
const getOrganizationSettingValue = vi.fn();

vi.mock('@/modules/tenancy/data/organization-settings.repository', () => ({
  upsertOrganizationSettingValue: (...args: unknown[]) => upsertOrganizationSettingValue(...args),
  getOrganizationSettingValue: (...args: unknown[]) => getOrganizationSettingValue(...args),
}));

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

describe('organization legal identity', () => {
  beforeEach(() => {
    upsertOrganizationSettingValue.mockReset();
    getOrganizationSettingValue.mockReset();
    upsertOrganizationSettingValue.mockResolvedValue(undefined);
  });

  it('parses and prefers taxId for OCR matching', () => {
    const identity = parseOrganizationLegalIdentity({
      taxId: '514628903',
      companyNumber: '511022493',
    });
    expect(identity.taxId).toBe('514628903');
    expect(identity.companyNumber).toBe('511022493');
    expect(resolveOrganizationTaxId(identity)).toBe('514628903');
  });

  it('saves legal identity on the legal_identity organization setting', async () => {
    const saved = await saveOrganizationLegalIdentity({} as OrgContext['db'], 'org-1', {
      taxId: '514-628-903',
      companyNumber: '511022493',
    });
    expect(saved).toEqual({ taxId: '514628903', companyNumber: '511022493' });
    expect(upsertOrganizationSettingValue).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      LEGAL_IDENTITY_SETTING_KEY,
      { taxId: '514628903', companyNumber: '511022493' },
    );
  });

  it('requires org.update to save from Settings → Business', async () => {
    await expect(
      updateOrganizationLegalIdentity(contextWith([]), { taxId: '514628903' }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const saved = await updateOrganizationLegalIdentity(contextWith([PERMISSIONS.ORG_UPDATE]), {
      taxId: '514628903',
    });
    expect(saved.taxId).toBe('514628903');
    expect(upsertOrganizationSettingValue).toHaveBeenCalled();
  });
});
