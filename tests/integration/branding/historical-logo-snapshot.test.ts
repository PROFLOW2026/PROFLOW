import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  confirmBrandAssetUpload,
  ensureDefaultBranding,
  getDefaultBrandProfile,
  prepareBrandAssetUpload,
  resolveDocumentBrand,
} from '@/modules/branding';
import { createQuote, transitionQuoteStatus } from '@/modules/quotes';
import { resolveOrgContext } from '@/modules/tenancy';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
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
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${crypto.randomUUID()}.png`;
  }

  async createUploadUrl(key: string) {
    this.objects.set(key, new Uint8Array([9, 9, 9]));
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
    const bytes = this.objects.get(key) ?? new Uint8Array([1]);
    return { bytes, contentType: 'image/png', size: bytes.length };
  }

  async remove(key: string) {
    this.objects.delete(key);
  }
}

describe('historical brand logo after replacement', () => {
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
  });

  it('Logo A remains on issued quote snapshot after Logo B replaces live brand', async () => {
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

      const logoA = await prepareBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        fileName: 'logo-a.png',
        mimeType: 'image/png',
        sizeBytes: 32,
      });
      await confirmBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        storageKey: logoA.storageKey,
        mimeType: 'image/png',
        sizeBytes: 32,
      });

      const quote = await createQuote(context, {
        title: 'Historical Logo Quote',
        currency: 'ILS',
        lines: [{ description: 'Line', quantity: '1', unitPriceAmount: '25' }],
      });
      await transitionQuoteStatus(context, { quoteId: quote.id, toStatus: 'sent' });

      const logoB = await prepareBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        fileName: 'logo-b.png',
        mimeType: 'image/png',
        sizeBytes: 32,
      });
      await confirmBrandAssetUpload(context, {
        brandProfileId: brand!.id,
        kind: 'logo_primary',
        storageKey: logoB.storageKey,
        mimeType: 'image/png',
        sizeBytes: 32,
      });

      expect(storage.objects.has(logoA.storageKey)).toBe(true);
      expect(storage.objects.has(logoB.storageKey)).toBe(true);

      const issued = await resolveDocumentBrand(context, {
        entityType: 'quote',
        entityId: quote.id,
        useSnapshotIfPresent: true,
        locale: 'en',
      });
      expect(issued.source).toBe('snapshot');
      expect(issued.snapshot.logoPrimaryKey).toBe(logoA.storageKey);

      const draft = await resolveDocumentBrand(context, {
        useSnapshotIfPresent: false,
        locale: 'en',
      });
      expect(draft.source).toBe('live');
      expect(draft.snapshot.logoPrimaryKey).toBe(logoB.storageKey);
    });
  });
});
