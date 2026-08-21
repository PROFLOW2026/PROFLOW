import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  confirmBrandAssetUpload,
  ensureDefaultBranding,
  getBrandAssetDownloadUrl,
  getDefaultBrandProfile,
  prepareBrandAssetUpload,
  removeBrandAsset,
  updateCompanyProfile,
} from '@/modules/branding';
import {
  acceptInvitation,
  createInvitation,
  createOrganization,
  resolveOrgContext,
} from '@/modules/tenancy';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../clients/setup';

class MockStoragePort implements StoragePort {
  readonly configured = true;
  readonly objects = new Map<string, Uint8Array>();

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    const unique = crypto.randomUUID();
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${unique}.png`;
  }

  async createUploadUrl(key: string) {
    this.objects.set(key, new Uint8Array([1, 2, 3]));
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
      token: 'tok',
      path: key,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async createDownloadUrl(key: string) {
    if (!this.objects.has(key)) throw new Error('missing');
    return {
      url: `https://storage.test/download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async downloadBytes(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('missing');
    return { bytes, contentType: 'image/png', size: bytes.length };
  }

  async remove(key: string) {
    this.objects.delete(key);
  }
}

async function onboardWorker(
  database: TestDatabase,
  ownerId: string,
  organizationId: string,
  workerEmail: string,
) {
  const invitation = await database.asUser(ownerId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId: ownerId, organizationId, locale: 'en' });
    return createInvitation(context, { email: workerEmail, roleKey: 'worker' });
  });
  const worker = await createTestUser(database, workerEmail);
  await database.asService((db) =>
    acceptInvitation(db, {
      token: invitation.token,
      userId: worker.id,
      userEmail: worker.email,
    }),
  );
  return worker;
}

describe('branding storage + permission isolation', () => {
  let database: TestDatabase;
  let storage: MockStoragePort;

  beforeAll(async () => {
    database = await createTestDatabase();
    storage = new MockStoragePort();
    setStoragePort(storage);
  });

  afterAll(async () => {
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.objects.clear();
    await seedSystem(database);
  });

  it('rejects cross-org branding upload / confirm / sign / remove', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const prepared = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      const brand = await getDefaultBrandProfile(context);
      expect(brand).toBeTruthy();
      return prepareBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        fileName: 'logo.png',
        mimeType: 'image/png',
        sizeBytes: 128,
      });
    });

    expect(prepared.storageKey.startsWith(`${orgA.organization.id}/branding/`)).toBe(true);

    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      const brandB = await getDefaultBrandProfile(context);

      await expect(
        confirmBrandAssetUpload(context, {
          brandProfileId: brandB!.id,
          kind: 'logo_primary',
          storageKey: prepared.storageKey,
          mimeType: 'image/png',
          sizeBytes: 128,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(getBrandAssetDownloadUrl(context, prepared.storageKey)).rejects.toBeInstanceOf(
        DomainRuleError,
      );

      await expect(
        removeBrandAsset(context, {
          brandProfileId: brandB!.id,
          kind: 'logo_primary',
        }),
      ).resolves.toBeTruthy();
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const brand = await getDefaultBrandProfile(context);
      await confirmBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'signature',
        storageKey: prepared.storageKey,
        mimeType: 'image/png',
        sizeBytes: 128,
      });
      const signed = await getBrandAssetDownloadUrl(context, prepared.storageKey);
      expect(signed?.url).toContain('storage.test/download');
    });
  });

  it('keeps previous logo storage object after replace (snapshot-safe)', async () => {
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
      const brand = await getDefaultBrandProfile(context);

      const first = await prepareBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        fileName: 'v1.png',
        mimeType: 'image/png',
        sizeBytes: 64,
      });
      await confirmBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        storageKey: first.storageKey,
        mimeType: 'image/png',
        sizeBytes: 64,
      });

      const second = await prepareBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        fileName: 'v2.png',
        mimeType: 'image/png',
        sizeBytes: 64,
      });
      expect(second.storageKey).not.toBe(first.storageKey);
      await confirmBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        storageKey: second.storageKey,
        mimeType: 'image/png',
        sizeBytes: 64,
      });

      expect(storage.objects.has(first.storageKey)).toBe(true);
      expect(storage.objects.has(second.storageKey)).toBe(true);

      const after = await getDefaultBrandProfile(context);
      expect(after?.logoPrimaryKey).toBe(second.storageKey);
    });
  });

  it('denies Worker branding/company mutations (server permission)', async () => {
    const owner = await createTestUser(database, 'brand-owner@example.test');
    const organizationId = await database.asUser(owner.id, async (tx) => {
      const created = await createOrganization(tx, owner.id, {
        name: 'Brand Perm Org',
        countryCode: 'IL',
      });
      return created.organization.id;
    });
    const worker = await onboardWorker(
      database,
      owner.id,
      organizationId,
      'brand-worker@example.test',
    );

    await database.asUser(worker.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: worker.id,
        organizationId,
        locale: 'en',
      });

      await expect(
        updateCompanyProfile(context, { displayName: 'Hacked' }),
      ).rejects.toBeInstanceOf(AuthorizationError);

      await expect(
        import('@/modules/branding').then((m) =>
          m.upsertOrganizationBrandProfile(context, { name: 'Evil' }),
        ),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    // RLS: worker UPDATE must not change company profile rows (org.update gated).
    await database.asUser(worker.id, async (tx) => {
      const { sql } = await import('drizzle-orm');
      await tx.execute(sql`
        UPDATE public.organization_company_profiles
           SET display_name = 'RLS Hack'
         WHERE organization_id = ${organizationId}::uuid
      `);
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId,
        locale: 'en',
      });
      const profile = await import('@/modules/branding').then((m) => m.getCompanyProfile(context));
      expect(profile.displayName).not.toBe('RLS Hack');
      expect(profile.displayName).not.toBe('Hacked');
    });
  });
});
