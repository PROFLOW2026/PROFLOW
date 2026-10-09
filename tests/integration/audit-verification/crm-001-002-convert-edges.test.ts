/**
 * CRM-001 / CRM-002 executable proof — AUDIT ONLY.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  acceptSalesQuoteVersion,
  convertCrmQuoteToProductQuote,
  createOpportunity,
  createSalesQuote,
  createSalesQuoteVersion,
  issueSalesQuoteVersion,
} from '@/modules/crm';
import {
  crmOpportunities,
  organizationMemberships,
  profiles,
  roleAssignments,
  rolePermissions,
  roles,
} from '@drizzle/schema';
import { createQuote, transitionQuoteStatus } from '@/modules/quotes';
import { convertQuote } from '@/modules/quotes/application/convert-quote';
import { findQuoteDetail } from '@/modules/quotes/data/quotes.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { PROJECT_ACCESS_SETTING_KEY } from '@/modules/projects/domain/project-access';
import { upsertOrganizationSettingValue } from '@/modules/tenancy/data/organization-settings.repository';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';

describe('audit CRM-001 / CRM-002 (EXEC)', () => {
  let database: TestDatabase;
  let orgId: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    const owner = await createTestUser(database, 'crm-edges-owner@example.test');
    ownerId = owner.id;
    const tenant = await createTestOrganization(database, owner, 'CRM Edges Org');
    orgId = tenant.organization.id;
    await database.asService(async (db) => {
      await upsertOrganizationSettingValue(db, orgId, PROJECT_ACCESS_SETTING_KEY, { mode: 'all' });
    });
  });

  async function memberWithPermissions(keys: string[]) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(profiles).values({
        id: userId,
        email: `crm-${userId.slice(0, 8)}@example.test`,
        displayName: 'Limited CRM',
      });
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });
      await db.insert(roles).values({
        id: roleId,
        organizationId: orgId,
        key: `crm_lim_${userId.slice(0, 6)}`,
        name: 'CRM limited',
        rank: 40,
        isProtected: false,
      });
      for (const permissionKey of keys) {
        await db.insert(rolePermissions).values({ organizationId: orgId, roleId, permissionKey });
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId,
        userId,
        roleId,
      });
    });
    return userId;
  }

  it('CRM-001: convertQuote wins linked opportunity even without crm.manage', async () => {
    let oppId = '';
    let quoteId = '';

    await database.asUser(ownerId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: ownerId, organizationId: orgId, locale: 'he-IL' });
      const opp = await createOpportunity(ctx, { name: 'No CRM manage' });
      oppId = opp.id;
      const quote = await createQuote(ctx, {
        title: 'Product Q',
        opportunityId: opp.id,
        lines: [{ description: 'Line', quantity: '1', unitPriceAmount: '1000' }],
      });
      quoteId = quote.id;
      await transitionQuoteStatus(ctx, { quoteId: quote.id, toStatus: 'sent' });
      await transitionQuoteStatus(ctx, { quoteId: quote.id, toStatus: 'accepted' });
    });

    const userId = await memberWithPermissions([
      PERMISSIONS.QUOTES_MANAGE,
      PERMISSIONS.QUOTES_READ,
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.PROJECTS_UPDATE,
      PERMISSIONS.PROJECTS_READ,
      PERMISSIONS.PROJECTS_ACCESS_ALL,
      PERMISSIONS.CONTRACTS_MANAGE,
      PERMISSIONS.CONTRACTS_READ,
      PERMISSIONS.CRM_READ,
    ]);

    let projectId = '';
    await database.asUser(userId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'he-IL' });
      const converted = await convertQuote(ctx, {
        quoteId,
        workKind: 'project',
        projectName: 'From quote',
      });
      projectId = converted.projectId;
      expect(projectId).toBeTruthy();
    });

    await database.asUser(ownerId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: ownerId, organizationId: orgId, locale: 'he-IL' });
      const [row] = await ctx.db
        .select({
          status: crmOpportunities.status,
          convertedProjectId: crmOpportunities.convertedProjectId,
        })
        .from(crmOpportunities)
        .where(eq(crmOpportunities.id, oppId));
      expect(row?.convertedProjectId).toBe(projectId);
      expect(row?.status).toBe('won');
    });
  });

  it('CRM-002: bridge uses acceptedVersionId not newer draft version lines', async () => {
    await database.asUser(ownerId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: ownerId, organizationId: orgId, locale: 'he-IL' });
      const opp = await createOpportunity(ctx, { name: 'Version pick' });
      const { quote: crmQuote, version: v1draft } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM Q',
        lines: [{ description: 'Accepted line', quantity: '1', unitAmount: '1000', lineTotal: '1000' }],
      });
      const v1 = await issueSalesQuoteVersion(ctx, { versionId: v1draft.id });
      const v2draft = await createSalesQuoteVersion(ctx, {
        salesQuoteId: crmQuote.id,
        lines: [{ description: 'Draft newer', quantity: '1', unitAmount: '9999', lineTotal: '9999' }],
      });
      expect(v2draft.versionNumber).toBeGreaterThan(v1.versionNumber);
      await acceptSalesQuoteVersion(ctx, { versionId: v1.id });

      const { productQuoteId } = await convertCrmQuoteToProductQuote(ctx, { salesQuoteId: crmQuote.id });
      const productQuote = await findQuoteDetail(ctx.db, ctx.organizationId, productQuoteId);
      expect(productQuote?.lines[0]?.description).toBe('Accepted line');
      expect(productQuote?.lines[0]?.unitPriceAmount).toBe('1000.000000');
    });
  });
});
