import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { eq } from 'drizzle-orm';
import { crmLeads } from '@drizzle/schema';
import { createLead, createOpportunity } from '@/modules/crm';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

describe('lead qualified on opportunity create (U04)', () => {
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

  it('marks new lead qualified when opportunity is created', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'lead-qual@example.test');
    const tenant = await createTestOrganization(database, owner, 'Lead Qual Org');

    await database.asUser(owner.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: tenant.organization.id,
        locale: 'he-IL',
      });
      const lead = await createLead(ctx, { title: 'Inbound call' });
      await createOpportunity(ctx, { name: 'Opp from lead', leadId: lead.id });
      const [row] = await tx
        .select({ status: crmLeads.status })
        .from(crmLeads)
        .where(eq(crmLeads.id, lead.id));
      expect(row?.status).toBe('qualified');
    });
  });
});
