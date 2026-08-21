import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organizationBrandProfiles } from '@drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  buildLiveBrandSnapshot,
  captureBrandSnapshot,
  ensureDefaultBranding,
  resolveDocumentBrand,
} from '@/modules/branding';
import { createQuote, transitionQuoteStatus } from '@/modules/quotes';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../clients/setup';

describe('document brand snapshots', () => {
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

  it('keeps the first brand snapshot immutable after company rename', async () => {
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

      const { updateCompanyProfile } = await import(
        '@/modules/branding/data/company-profile.repository'
      );
      await updateCompanyProfile(context.db, context.organizationId, {
        legalName: 'Acme Before',
        displayName: 'Acme Before',
      });

      const quote = await createQuote(context, {
        title: 'Immutable Quote',
        currency: 'ILS',
        lines: [{ description: 'Line', quantity: '1', unitPriceAmount: '10' }],
      });
      await transitionQuoteStatus(context, { quoteId: quote.id, toStatus: 'sent' });

      const first = await captureBrandSnapshot(context, {
        entityType: 'quote',
        entityId: quote.id,
      });
      expect(first.snapshot.companyDisplayName).toBe('Acme Before');

      await updateCompanyProfile(context.db, context.organizationId, {
        legalName: 'Acme After',
        displayName: 'Acme After',
      });

      const second = await captureBrandSnapshot(context, {
        entityType: 'quote',
        entityId: quote.id,
      });
      expect(second.id).toBe(first.id);
      expect(second.snapshot.companyDisplayName).toBe('Acme Before');

      const resolved = await resolveDocumentBrand(context, {
        entityType: 'quote',
        entityId: quote.id,
        useSnapshotIfPresent: true,
        theme: 'customer',
        locale: 'en',
      });
      expect(resolved.source).toBe('snapshot');
      expect(resolved.context.companyDisplayName).toBe('Acme Before');

      const live = await buildLiveBrandSnapshot(context);
      expect(live.companyDisplayName).toBe('Acme After');
    });
  });

  it('blocks assigning another organization brand profile id', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const foreignBrandId = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: 'Org B Co',
        countryCode: 'IL',
      });
      const [row] = await context.db
        .select({ id: organizationBrandProfiles.id })
        .from(organizationBrandProfiles)
        .where(eq(organizationBrandProfiles.organizationId, context.organizationId))
        .limit(1);
      return row!.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: 'Org A Co',
        countryCode: 'IL',
      });

      await expect(
        captureBrandSnapshot(context, {
          entityType: 'quote',
          entityId: crypto.randomUUID(),
          brandProfileId: foreignBrandId,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        buildLiveBrandSnapshot(context, { brandProfileId: foreignBrandId }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });
});
