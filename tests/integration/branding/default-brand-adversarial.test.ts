import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  archiveBrandProfile,
  ensureDefaultBranding,
  listOrganizationBrandProfiles,
  setDefaultBrandProfile,
  upsertOrganizationBrandProfile,
} from '@/modules/branding';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../clients/setup';

function errorText(err: unknown): string {
  return [
    err instanceof Error ? err.message : String(err),
    err instanceof Error && err.cause instanceof Error ? err.cause.message : '',
    err instanceof Error && err.cause ? String(err.cause) : '',
  ].join('\n');
}

describe('exact-one-default brand adversarial', () => {
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

  it('PASS atomic default replacement via application', async () => {
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

      const initial = await listOrganizationBrandProfiles(context);
      expect(initial.filter((p) => p.isDefault && p.status === 'active')).toHaveLength(1);
      const originalDefault = initial.find((p) => p.isDefault)!;

      const alt = await upsertOrganizationBrandProfile(context, {
        name: 'Secondary Brand',
        setAsDefault: true,
      });
      expect(alt.isDefault).toBe(true);

      const afterSwap = await listOrganizationBrandProfiles(context);
      expect(afterSwap.filter((p) => p.isDefault && p.status === 'active')).toHaveLength(1);
      expect(afterSwap.find((p) => p.id === originalDefault.id)?.isDefault).toBe(false);

      await setDefaultBrandProfile(context, originalDefault.id);
      await archiveBrandProfile(context, alt.id);

      const remaining = await listOrganizationBrandProfiles(context);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.isDefault).toBe(true);
    });
  });

  it('BLOCKS archive current default without replacement (app)', async () => {
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
      const only = (await listOrganizationBrandProfiles(context)).find((p) => p.isDefault)!;
      await expect(archiveBrandProfile(context, only.id)).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('BLOCKS archive last active brand via direct SQL', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const brandId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      return (await listOrganizationBrandProfiles(context)).find((p) => p.isDefault)!.id;
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          UPDATE public.organization_brand_profiles
             SET status = 'archived',
                 archived_at = now(),
                 is_default = false
           WHERE id = ${brandId}::uuid
             AND organization_id = ${orgA.organization.id}::uuid
        `);
      }),
    ).rejects.toSatisfy((err: unknown) =>
      /exactly one active default|Failed query|check_violation/i.test(errorText(err)),
    );
  });

  it('BLOCKS second-default mutation via direct SQL (unique index)', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const ids = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      const original = (await listOrganizationBrandProfiles(context)).find((p) => p.isDefault)!;
      const alt = await upsertOrganizationBrandProfile(context, {
        name: 'Non Default Brand',
        setAsDefault: false,
      });
      return { originalId: original.id, altId: alt.id, orgId: orgA.organization.id };
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          UPDATE public.organization_brand_profiles
             SET is_default = true
           WHERE id = ${ids.altId}::uuid
             AND organization_id = ${ids.orgId}::uuid
        `);
      }),
    ).rejects.toThrow();
  });

  it('BLOCKS zero-default UPDATE bypass via direct SQL', async () => {
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
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          UPDATE public.organization_brand_profiles
             SET is_default = false
           WHERE organization_id = ${orgA.organization.id}::uuid
             AND is_default = true
             AND status = 'active'
             AND archived_at IS NULL
        `);
      }),
    ).rejects.toSatisfy((err: unknown) =>
      /exactly one active default|Failed query/i.test(errorText(err)),
    );
  });

  it('BLOCKS direct INSERT of a second active default', async () => {
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
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO public.organization_brand_profiles (
            organization_id, name, is_default, status
          ) VALUES (
            ${orgA.organization.id}::uuid,
            'Rogue Default',
            true,
            'active'
          )
        `);
      }),
    ).rejects.toThrow();
  });
});
