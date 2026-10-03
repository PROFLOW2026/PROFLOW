import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import {
  acceptSalesQuoteVersion,
  convertCrmQuoteToProductQuote,
  convertWonOpportunity,
  createOpportunity,
  createSalesQuote,
  issueSalesQuoteVersion,
  updateOpportunity,
} from '@/modules/crm';
import { createQuote, transitionQuoteStatus } from '@/modules/quotes';
import { convertQuote } from '@/modules/quotes/application/convert-quote';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

describe('CRM / product quote conversion flows (launch verification)', () => {
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

  async function ownerContext(database: TestDatabase) {
    await seedSystem(database);
    const owner = await createTestUser(database, 'crm-flow@example.test');
    const tenant = await createTestOrganization(database, owner, 'CRM Flow Org');
    return {
      owner,
      tenant,
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

  it('A: product quote accept → convert → single downstream project', async () => {
    const { withCtx, tenant } = await ownerContext(database);
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'Direct product path' });
      const quote = await createQuote(ctx, {
        title: 'Product quote',
        opportunityId: opp.id,
        lines: [{ description: 'Scope', quantity: '1', unitPriceAmount: '10000' }],
      });
      await transitionQuoteStatus(ctx, { quoteId: quote.id, toStatus: 'sent' });
      await transitionQuoteStatus(ctx, { quoteId: quote.id, toStatus: 'accepted' });

      const first = await convertWonOpportunity(ctx, { opportunityId: opp.id });
      expect(first.projectId).toBeTruthy();

      const second = await convertQuote(ctx, {
        quoteId: quote.id,
        workKind: 'project',
        projectName: 'Repeat convert attempt',
      });
      expect(second.idempotent).toBe(true);
      expect(second.projectId).toBe(first.projectId);

      const projectRows = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, tenant.organization.id), eq(projects.id, first.projectId)));
      expect(projectRows).toHaveLength(1);
    });
  });

  it('B: CRM quote → bridge → product accept → convert', async () => {
    const { withCtx } = await ownerContext(database);
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'CRM bridge path' });
      const { quote: crmQuote, version } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM sales quote',
        lines: [
          {
            description: 'CRM line',
            quantity: '1',
            unitAmount: '5000',
            lineTotal: '5000',
          },
        ],
      });
      const issued = await issueSalesQuoteVersion(ctx, { versionId: version.id });
      await acceptSalesQuoteVersion(ctx, { versionId: issued.id });

      const bridged = await convertCrmQuoteToProductQuote(ctx, {
        salesQuoteId: crmQuote.id,
      });
      await transitionQuoteStatus(ctx, { quoteId: bridged.productQuoteId, toStatus: 'sent' });
      await transitionQuoteStatus(ctx, { quoteId: bridged.productQuoteId, toStatus: 'accepted' });

      const converted = await convertQuote(ctx, {
        quoteId: bridged.productQuoteId,
        workKind: 'project',
        projectName: 'From CRM bridge',
      });
      expect(converted.projectId).toBeTruthy();
    });
  });

  it('C: premature won status is rejected', async () => {
    const { withCtx } = await ownerContext(database);
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'Premature won' });
      await expect(
        updateOpportunity(ctx, { opportunityId: opp.id, status: 'won' }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('D: accepted CRM quote alone cannot convert opportunity without product quote', async () => {
    const { withCtx } = await ownerContext(database);
    await withCtx(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'CRM only accept' });
      const { version } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM only',
        lines: [
          { description: 'Line', quantity: '1', unitAmount: '1000', lineTotal: '1000' },
        ],
      });
      const issued = await issueSalesQuoteVersion(ctx, { versionId: version.id });
      await acceptSalesQuoteVersion(ctx, { versionId: issued.id });

      await expect(convertWonOpportunity(ctx, { opportunityId: opp.id })).rejects.toBeInstanceOf(
        DomainRuleError,
      );
    });
  });
});
