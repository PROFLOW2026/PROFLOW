import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  convertCrmQuoteToProductQuote,
  createOpportunity,
  createSalesQuote,
  createSalesQuoteVersion,
} from '@/modules/crm';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

describe('CRM quote bridge lock (U04)', () => {
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

  async function ownerContext() {
    await seedSystem(database);
    const owner = await createTestUser(database, 'crm-bridge@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM Bridge Org');
    return {
      withCtx: <T>(fn: (ctx: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>) =>
        database.asUser(owner.id, async (tx) => {
          const ctx = await resolveOrgContext(tx, {
            userId: owner.id,
            organizationId: tenant.organization.id,
            locale: 'he-IL',
          });
          return fn(ctx);
        }),
    };
  }

  it('double convert returns the same product quote id', async () => {
    const { withCtx } = await ownerContext();
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'Bridge opp' });
      const { quote } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM bid',
        lines: [{ description: 'Line', unitAmount: '100', lineTotal: '100' }],
      });
      const first = await convertCrmQuoteToProductQuote(ctx, { salesQuoteId: quote.id });
      const second = await convertCrmQuoteToProductQuote(ctx, { salesQuoteId: quote.id });
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.productQuoteId).toBe(first.productQuoteId);
    });
  });

  it('blocks new CRM version after conversion', async () => {
    const { withCtx } = await ownerContext();
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'Lock opp' });
      const { quote } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM bid',
        lines: [{ description: 'Line', unitAmount: '100', lineTotal: '100' }],
      });
      await convertCrmQuoteToProductQuote(ctx, { salesQuoteId: quote.id });
      await expect(
        createSalesQuoteVersion(ctx, {
          salesQuoteId: quote.id,
          lines: [{ description: 'V2', unitAmount: '200', lineTotal: '200' }],
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });
});
