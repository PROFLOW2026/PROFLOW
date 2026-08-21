import { describe, expect, it } from 'vitest';
import {
  archiveBrandProfile,
  ensureDefaultBranding,
  listOrganizationBrandProfiles,
  setDefaultBrandProfile,
  upsertOrganizationBrandProfile,
} from '@/modules/branding';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../clients/setup';

describe('default brand invariant', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('keeps exactly one active default and blocks archiving it', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });

      const profiles = await listOrganizationBrandProfiles(context);
      expect(profiles.filter((p) => p.isDefault && p.status === 'active')).toHaveLength(1);
      const originalDefault = profiles.find((p) => p.isDefault)!;

      const alt = await upsertOrganizationBrandProfile(context, {
        name: 'Alt Brand',
        setAsDefault: true,
      });
      expect(alt.isDefault).toBe(true);

      const afterSwap = await listOrganizationBrandProfiles(context);
      expect(afterSwap.filter((p) => p.isDefault && p.status === 'active')).toHaveLength(1);
      expect(afterSwap.find((p) => p.id === originalDefault.id)?.isDefault).toBe(false);

      await expect(archiveBrandProfile(context, alt.id)).rejects.toBeInstanceOf(DomainRuleError);

      await setDefaultBrandProfile(context, originalDefault.id);
      await archiveBrandProfile(context, alt.id);

      const remaining = await listOrganizationBrandProfiles(context);
      expect(remaining.every((p) => p.status === 'active')).toBe(true);
      expect(remaining.filter((p) => p.isDefault)).toHaveLength(1);

      await expect(archiveBrandProfile(context, originalDefault.id)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
    });
  });
});
