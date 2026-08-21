import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approvalRuleSteps,
  approvalRules,
  clients,
  expenseAllocations,
  organizationCatalogEntries,
  vendorCatalogLinks,
} from '@drizzle/schema';
import { createApprovalRule } from '@/modules/approvals';
import {
  createBusinessCatalogEntry,
  deactivateBusinessCatalogEntry,
  listBusinessCatalog,
} from '@/modules/business-catalog';
import { createClient, updateClient } from '@/modules/clients';
import { createDailyLog, updateDailyLog } from '@/modules/field-ops';
import { createAsset } from '@/modules/assets';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { createEmployee } from '@/modules/workforce';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { NotFoundError } from '@/shared/errors';
import type { BusinessCatalogKind } from '@/modules/business-catalog/domain/types';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

function rejectsIntegrity(error: unknown): boolean {
  return /catalog kind mismatch|23514|23503|foreign key|RESTRICT|unique|duplicate key|approval_rule_steps_rule_order|Failed query/i.test(
    errorBlob(error),
  );
}

async function catalogEntryId(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  kind: BusinessCatalogKind,
  key?: string,
): Promise<string> {
  return database.asUser(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
    const rows = await listBusinessCatalog(context, kind);
    const row = key ? rows.find((entry) => entry.key === key) : rows[0];
    if (!row) throw new Error(`missing seeded catalog kind=${kind}`);
    return row.id;
  });
}

describe('business catalog negative integrity (0060)', () => {
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

  it('rejects client_type_id pointing at a payment_term catalog entry (kind mismatch)', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { clientId, paymentTermId } = await (async () => {
      const paymentTermId = await catalogEntryId(
        database,
        userA.id,
        orgA.organization.id,
        'payment_term',
        'net_30',
      );
      const clientId = await database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const client = await createClient(context, { name: 'Kind Guard Client' });
        return client.id;
      });
      return { clientId, paymentTermId };
    })();

    await expect(
      database.asService(async (db) => {
        await db.execute(
          sql`UPDATE clients SET client_type_id = ${paymentTermId}::uuid WHERE id = ${clientId}::uuid`,
        );
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects vendor_specialty whose parent is not vendor_category', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const paymentTermId = await catalogEntryId(
      database,
      userA.id,
      orgA.organization.id,
      'payment_term',
      'net_30',
    );

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await createBusinessCatalogEntry(context, {
          kind: 'vendor_specialty',
          name: 'Bad Parent Specialty',
          key: 'bad_parent_specialty',
          parentId: paymentTermId,
        });
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects vendor_catalog_links when link_kind does not match entry kind', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { vendorId, categoryId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Catalog Link Vendor' });
      const category = await createBusinessCatalogEntry(context, {
        kind: 'vendor_category',
        name: 'Electrical',
        key: 'electrical_trade',
      });
      return { vendorId: vendor.id, categoryId: category.id };
    });

    await expect(
      database.asService(async (db) => {
        await db.insert(vendorCatalogLinks).values({
          organizationId: orgA.organization.id,
          vendorId,
          catalogEntryId: categoryId,
          linkKind: 'vendor_specialty',
        });
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects cost_code_id pointing at lead_source on expense_allocations', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const leadSourceId = await catalogEntryId(
      database,
      userA.id,
      orgA.organization.id,
      'lead_source',
      'referral',
    );

    const allocationId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Cost Code Site' });
      const expense = await createExpense(context, {
        amount: '500',
        currency: 'ILS',
        description: 'Allocation row',
        projectId,
      });
      const [allocation] = await tx
        .insert(expenseAllocations)
        .values({
          organizationId: orgA.organization.id,
          expenseId: expense.id,
          targetType: 'project',
          projectId,
          method: 'manual_amount',
          amount: '500.000000',
          currency: 'ILS',
          amountBasis: 'net',
        })
        .returning({ id: expenseAllocations.id });
      return allocation!.id;
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(
          sql`UPDATE expense_allocations SET cost_code_id = ${leadSourceId}::uuid WHERE id = ${allocationId}::uuid`,
        );
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects cross-org catalog FK on clients.client_type_id', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const { clientId, foreignTypeId } = await Promise.all([
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const client = await createClient(context, { name: 'Cross Org Client' });
        return client.id;
      }),
      catalogEntryId(database, userB.id, orgB.organization.id, 'client_type', 'private'),
    ]).then(([clientId, foreignTypeId]) => ({ clientId, foreignTypeId }));

    await expect(
      database.asService(async (db) => {
        await db.execute(
          sql`UPDATE clients SET client_type_id = ${foreignTypeId}::uuid WHERE id = ${clientId}::uuid`,
        );
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects cross-org user on approval_rule_steps', async () => {
    const { orgA, orgB: _orgB, userA, userB } = await provisionTwoTenants(database);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await createApprovalRule(context, {
          name: 'Cross-org approver',
          entityType: 'expense',
          thresholdAmount: null,
          currency: 'ILS',
          enabled: true,
          steps: [
            {
              stepOrder: 1,
              approverStrategy: 'user',
              userId: userB.id,
            },
          ],
        });
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects duplicate approval_rule_steps step_order for the same rule', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const ruleId = await database.asUser(userA.id, async (tx) => {
      const _context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const [rule] = await tx
        .insert(approvalRules)
        .values({
          organizationId: orgA.organization.id,
          name: 'Dup step rule',
          entityType: 'expense',
          enabled: true,
        })
        .returning({ id: approvalRules.id });
      return rule!.id;
    });

    await expect(
      database.asService(async (db) => {
        await db.insert(approvalRuleSteps).values([
          {
            organizationId: orgA.organization.id,
            ruleId,
            stepOrder: 1,
            approverStrategy: 'role_template',
            roleTemplateKey: 'owner',
          },
          {
            organizationId: orgA.organization.id,
            ruleId,
            stepOrder: 1,
            approverStrategy: 'role_template',
            roleTemplateKey: 'manager',
          },
        ]);
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('rejects daily log links to cross-org employee, vendor, and asset', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const fixtures = await database.asUser(userA.id, async (tx) => {
      const contextA = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(contextA, { name: 'Daily Log Site' });
      const log = await createDailyLog(contextA, {
        projectId,
        logDate: '2026-08-14',
        summary: 'Integrity probe',
      });
      return { logId: log.id, projectId };
    });

    const foreignVendorId = await database.asUser(userB.id, async (tx) => {
      const contextB = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return (await createVendor(contextB, { name: 'Foreign Vendor' })).id;
    });

    const foreignEmployeeId = await database.asUser(userB.id, async (tx) => {
      const contextB = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return (await createEmployee(contextB, { name: 'Foreign Worker', rateUnit: 'hourly' })).id;
    });

    const foreignAssetId = await database.asUser(userB.id, async (tx) => {
      const contextB = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return (await createAsset(contextB, { name: 'Foreign Excavator', assetKind: 'equipment' })).asset.id;
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await updateDailyLog(context, {
          dailyLogId: fixtures.logId,
          vendorIds: [foreignVendorId],
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await updateDailyLog(context, {
          dailyLogId: fixtures.logId,
          employeeIds: [foreignEmployeeId],
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await updateDailyLog(context, {
          dailyLogId: fixtures.logId,
          assetIds: [foreignAssetId],
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO daily_log_vendors (organization_id, daily_log_id, vendor_id)
          VALUES (${orgA.organization.id}::uuid, ${fixtures.logId}::uuid, ${foreignVendorId}::uuid)
        `);
      }),
    ).rejects.toSatisfy(rejectsIntegrity);

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO daily_log_employees (organization_id, daily_log_id, employee_id)
          VALUES (${orgA.organization.id}::uuid, ${fixtures.logId}::uuid, ${foreignEmployeeId}::uuid)
        `);
      }),
    ).rejects.toSatisfy(rejectsIntegrity);

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO daily_log_assets (organization_id, daily_log_id, asset_id)
          VALUES (${orgA.organization.id}::uuid, ${fixtures.logId}::uuid, ${foreignAssetId}::uuid)
        `);
      }),
    ).rejects.toSatisfy(rejectsIntegrity);
  });

  it('deactivates in-use catalog entries but blocks hard delete (RESTRICT)', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const clientTypeId = await catalogEntryId(
      database,
      userA.id,
      orgA.organization.id,
      'client_type',
      'private',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Typed Client' });
      await updateClient(context, { clientId: client.id, clientTypeId });
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await deactivateBusinessCatalogEntry(context, clientTypeId);
      const [row] = await tx
        .select({
          isActive: organizationCatalogEntries.isActive,
          archivedAt: organizationCatalogEntries.archivedAt,
        })
        .from(organizationCatalogEntries)
        .where(sql`${organizationCatalogEntries.id} = ${clientTypeId}::uuid`)
        .limit(1);
      expect(row?.isActive).toBe(false);
      expect(row?.archivedAt).toBeTruthy();
    });

    await expect(
      database.asService(async (db) => {
        await db.delete(organizationCatalogEntries).where(sql`${organizationCatalogEntries.id} = ${clientTypeId}::uuid`);
      }),
    ).rejects.toSatisfy(rejectsIntegrity);

    const stillReferenced = await database.asService(async (db) => {
      const [client] = await db
        .select({ clientTypeId: clients.clientTypeId })
        .from(clients)
        .where(sql`${clients.clientTypeId} = ${clientTypeId}::uuid`)
        .limit(1);
      return client?.clientTypeId ?? null;
    });
    expect(stillReferenced).toBe(clientTypeId);
  });
});
