import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import {
  organizationMemberships,
  organizationModulePreferences,
  costCategories,
  expenses,
  phases,
  projects,
  workPackages,
} from '@drizzle/schema';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { createExpenseAdjustment } from '@/modules/expenses/application/create-expense-adjustment';
import { createExpenseReversal } from '@/modules/expenses/application/create-expense-reversal';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { updateExpense } from '@/modules/expenses/application/update-expense';
import { voidExpense } from '@/modules/expenses/application/void-expense';
import { getExpenseCorrectionChain } from '@/modules/expenses/application/get-expense-correction-chain';
import { getExpense, listExpensesForOrg } from '@/modules/expenses/application/queries';
import { loadProjectExpenseContributions } from '@/modules/financials/data/expenses.repository';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createVendor } from '@/modules/vendors';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { fromNumericString, sumMoney } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

/**
 * Provisions tenants through the service role because PGlite applies RLS
 * policies to the default connection role; organization creation is still
 * exercised through the real use case, and every assertion runs as the acting
 * user via `asUser`.
 */
async function provisionTenant(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) => createOrganization(db, owner.id, { name, countryCode: 'IL' }));
}

async function createProjectWithDefaultPackage(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  name: string,
) {
  return database.asUser(userId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ organizationId, name, status: 'active' })
      .returning({ id: projects.id });

    const [pkg] = await tx
      .insert(workPackages)
      .values({
        organizationId,
        projectId: project!.id,
        name: 'General',
        isDefault: true,
        sortOrder: 0,
      })
      .returning({ id: workPackages.id });

    return { projectId: project!.id, workPackageId: pkg!.id };
  });
}

describe('expenses integration', () => {
  let database: TestDatabase;
  let userA: TestUser;
  let userB: TestUser;
  let orgAId: string;
  let orgBId: string;
  let orgAProjectId: string;
  let orgAExpenseId: string;
  let orgAMaterialsCategoryId: string;
  let orgAOverheadCategoryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);

    userA = await createTestUser(database, 'owner-a@example.test');
    userB = await createTestUser(database, 'owner-b@example.test');

    const orgA = await provisionTenant(database, userA, 'Alpha Electrical');
    const orgB = await provisionTenant(database, userB, 'Beta Construction');
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;

    const created = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Site Alpha');
    orgAProjectId = created.projectId;

    const categoryRows = await database.asService(async (db) =>
      db
        .select({ id: costCategories.id, key: costCategories.key })
        .from(costCategories)
        .where(eq(costCategories.organizationId, orgAId)),
    );
    orgAMaterialsCategoryId = categoryRows.find((r) => r.key === 'materials')!.id;
    orgAOverheadCategoryId = categoryRows.find((r) => r.key === 'other_overhead')!.id;

    orgAExpenseId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });
      const expense = await createExpense(context, {
        amount: '1500',
        currency: 'ILS',
        description: 'Alpha materials',
        projectId: orgAProjectId,
      });
      return expense.id;
    });
  });

  afterAll(async () => {
    await database.close();
  });

  it('does not let organization B read organization A expenses', async () => {
    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgBId,
          locale: 'en',
        });
        return listExpensesForOrg(context);
      }),
    ).resolves.toEqual(expect.objectContaining({ items: [], total: 0 }));
  });

  it('does not let organization B fetch organization A expense by id', async () => {
    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgBId,
          locale: 'en',
        });
        return getExpense(context, orgAExpenseId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates, finalizes, and voids an expense with allocation lines', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Kitchen remodel',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const overhead = await createExpense(context, {
        amount: '1000',
        currency: 'ILS',
        description: 'Shared invoice',
        vatMode: 'zero',
        costCategoryId: orgAOverheadCategoryId,
        costFamily: 'business_overhead',
        allocations: [
          {
            targetType: 'project',
            projectId,
            method: 'manual_amount',
            amount: '700',
            sortOrder: 0,
          },
          {
            targetType: 'overhead',
            method: 'manual_amount',
            amount: '300',
            sortOrder: 1,
          },
        ],
      });

      expect(overhead.status).toBe('draft');
      expect(overhead.allocations).toHaveLength(2);
      expect(overhead.costFamily).toBe('business_overhead');

      const finalized = await finalizeExpense(context, overhead.id);
      expect(finalized.status).toBe('finalized');
      expect(finalized.taxSnapshot).not.toBeNull();

      const voided = await voidExpense(context, overhead.id);
      expect(voided.status).toBe('void');
    });
  });

  it('notes overhead module usage on first overhead expense', async () => {
    await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgBId,
        locale: 'en',
      });

      await createExpense(context, {
        amount: '500',
        currency: 'ILS',
        description: 'Office rent',
      });
    });

    const preference = await database.asService(async (db) => {
      const [row] = await db
        .select()
        .from(organizationModulePreferences)
        .where(
          and(
            eq(organizationModulePreferences.organizationId, orgBId),
            eq(organizationModulePreferences.moduleKey, 'overhead'),
          ),
        );
      return row;
    });

    expect(preference?.firstUsedAt).not.toBeNull();
  });

  it('leaves project cost at zero after voiding a finalized expense', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Void cost check',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const expense = await createExpense(context, {
        amount: '1000',
        currency: 'ILS',
        projectId,
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, expense.id);
      await voidExpense(context, expense.id);

      const finalizedRows = await tx
        .select({ grossAmount: expenses.grossAmount, currency: expenses.currency })
        .from(expenses)
        .where(
          and(
            eq(expenses.organizationId, orgAId),
            eq(expenses.projectId, projectId),
            eq(expenses.status, 'finalized'),
          ),
        );
      const total = sumMoney(
        finalizedRows.map((row) => fromNumericString(row.grossAmount, row.currency)!),
        'ILS',
      );
      expect(total.amount).toBe('0.000000');
    });
  });

  it('rejects a foreign currency on a project expense at write time', async () => {
    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      await expect(
        createExpense(context, {
          amount: '100',
          currency: 'USD',
          projectId: orgAProjectId,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('rejects allocation lines on a project-targeted expense', async () => {
    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      await expect(
        createExpense(context, {
          amount: '1000',
          currency: 'ILS',
          projectId: orgAProjectId,
          allocations: [
            {
              targetType: 'project',
              projectId: orgAProjectId,
              method: 'manual_amount',
              amount: '1000',
              sortOrder: 0,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('rejects vendor and phase ids from another organization', async () => {
    const orgBVendorId = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgBId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Foreign supplier' });
      return vendor.id;
    });

    const { projectId: orgBProjectId, workPackageId: orgBWorkPackageId } =
      await createProjectWithDefaultPackage(database, userB.id, orgBId, 'Foreign site');

    const orgBPhaseId = await database.asService(async (db) => {
      const [phase] = await db
        .insert(phases)
        .values({
          organizationId: orgBId,
          projectId: orgBProjectId,
          workPackageId: orgBWorkPackageId,
          name: 'Phase 1',
          sortOrder: 0,
        })
        .returning({ id: phases.id });
      return phase!.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      await expect(
        createExpense(context, {
          amount: '100',
          currency: 'ILS',
          projectId: orgAProjectId,
          vendorId: orgBVendorId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        createExpense(context, {
          amount: '100',
          currency: 'ILS',
          projectId: orgAProjectId,
          phaseId: orgBPhaseId,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('creates a voidsExpenseId reversing entry that nets Actual to zero', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Reversal site',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const original = await createExpense(context, {
        amount: '1000',
        currency: 'ILS',
        projectId,
        description: 'Wrong amount',
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, original.id);

      const reversal = await createExpenseReversal(context, original.id);
      expect(reversal.status).toBe('finalized');
      expect(reversal.voidsExpenseId).toBe(original.id);
      expect(reversal.grossAmount.amount).toBe('-1000.000000');
      expect(reversal.netAmount.amount).toBe('-1000.000000');

      await expect(createExpenseReversal(context, original.id)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
      await expect(voidExpense(context, original.id)).rejects.toBeInstanceOf(DomainRuleError);

      const contributions = await loadProjectExpenseContributions(tx, orgAId, projectId);
      const { cost } = aggregateProjectCosts(contributions, null, 'ILS');
      expect(cost.actualCostToDate.amount).toBe('0.000000');
    });
  });

  it('creates an adjustsExpenseId replacement after reversing the original', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Adjustment site',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const original = await createExpense(context, {
        amount: '2000',
        currency: 'ILS',
        projectId,
        description: 'Old figure',
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, original.id);

      const { replacement, reversal } = await createExpenseAdjustment(context, {
        adjustsExpenseId: original.id,
        amount: '1500',
        currency: 'ILS',
        projectId,
        description: 'Corrected figure',
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });

      expect(reversal?.voidsExpenseId).toBe(original.id);
      expect(replacement.status).toBe('draft');
      expect(replacement.adjustsExpenseId).toBe(original.id);

      await finalizeExpense(context, replacement.id);

      const contributions = await loadProjectExpenseContributions(tx, orgAId, projectId);
      const { cost } = aggregateProjectCosts(contributions, null, 'ILS');
      expect(cost.actualCostToDate.amount).toBe('1500.000000');
    });
  });

  it('corrects finalized 52000 → 50000 with exact ledger net (+52k -52k +50k)', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Correction 52k site',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const original = await createExpense(context, {
        amount: '52000',
        currency: 'ILS',
        projectId,
        description: 'Materials wrong amount',
        netAmount: '52000',
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });
      await finalizeExpense(context, original.id);

      const { replacement, reversal } = await createExpenseAdjustment(context, {
        adjustsExpenseId: original.id,
        amount: '50000',
        currency: 'ILS',
        projectId,
        description: 'Materials corrected',
        netAmount: '50000',
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });

      expect(reversal?.netAmount.amount).toBe('-52000.000000');
      expect(replacement.netAmount.amount).toBe('50000.000000');
      expect(replacement.adjustsExpenseId).toBe(original.id);

      await finalizeExpense(context, replacement.id);

      const chain = await getExpenseCorrectionChain(context, original.id);
      expect(chain.entries).toHaveLength(3);
      expect(chain.entries.map((entry) => entry.role)).toEqual([
        'original',
        'reversal',
        'replacement',
      ]);
      expect(chain.netAmount.amount).toBe('50000.000000');

      const contributions = await loadProjectExpenseContributions(tx, orgAId, projectId);
      const { cost } = aggregateProjectCosts(contributions, null, 'ILS');
      expect(cost.actualCostToDate.amount).toBe('50000.000000');
    });
  });

  it('finalizes on approve path while payment stays open', async () => {
    const { projectId } = await createProjectWithDefaultPackage(
      database,
      userA.id,
      orgAId,
      'Approve unpaid site',
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const draft = await createExpense(context, {
        amount: '1000',
        currency: 'ILS',
        projectId,
        vatMode: 'zero',
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
      });
      expect(draft.status).toBe('draft');

      const approved = await finalizeExpense(context, draft.id);
      expect(approved.status).toBe('finalized');
      expect(approved.paymentStatus).not.toBe('paid');
      expect(approved.paidAt).toBeNull();
    });
  });

  it('allocates multi-project vendor expense NET across three projects exactly', async () => {
    const projectA = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Vendor A');
    const projectB = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Vendor B');
    const projectC = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Vendor C');

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const vendor = await createVendor(context, { name: 'Materials vendor' });
      const expense = await createExpense(context, {
        amount: '39600',
        currency: 'ILS',
        netAmount: '39600',
        vatMode: 'zero',
        vendorId: vendor.id,
        costCategoryId: orgAMaterialsCategoryId,
        costFamily: 'direct_project',
        allocationIntent: 'project_allocate',
        allocations: [
          {
            targetType: 'project',
            projectId: projectA.projectId,
            method: 'manual_amount',
            amount: '15000',
            sortOrder: 0,
          },
          {
            targetType: 'project',
            projectId: projectB.projectId,
            method: 'manual_amount',
            amount: '14600',
            sortOrder: 1,
          },
          {
            targetType: 'project',
            projectId: projectC.projectId,
            method: 'manual_amount',
            amount: '10000',
            sortOrder: 2,
          },
        ],
      });
      expect(expense.projectId).toBeNull();
      expect(expense.allocationIntent).toBe('project_allocate');
      await finalizeExpense(context, expense.id);

      for (const [projectId, expected] of [
        [projectA.projectId, '15000.000000'],
        [projectB.projectId, '14600.000000'],
        [projectC.projectId, '10000.000000'],
      ] as const) {
        const contributions = await loadProjectExpenseContributions(tx, orgAId, projectId);
        const { cost } = aggregateProjectCosts(contributions, null, 'ILS');
        expect(cost.actualCostToDate.amount).toBe(expected);
      }
    });
  });

  it('allocates subcontractor multi-project expense as one vendor obligation', async () => {
    const projectA = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Sub A');
    const projectB = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Sub B');
    const projectC = await createProjectWithDefaultPackage(database, userA.id, orgAId, 'Sub C');

    const subcontractorCategoryId = await database.asService(async (db) => {
      const [row] = await db
        .select({ id: costCategories.id })
        .from(costCategories)
        .where(
          and(eq(costCategories.organizationId, orgAId), eq(costCategories.key, 'subcontractor')),
        );
      return row!.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });

      const vendor = await createVendor(context, { name: 'Subcontractor Ltd', type: 'subcontractor' });
      const expense = await createExpense(context, {
        amount: '100000',
        currency: 'ILS',
        netAmount: '100000',
        vatMode: 'zero',
        vendorId: vendor.id,
        costCategoryId: subcontractorCategoryId,
        costFamily: 'direct_project',
        allocationIntent: 'project_allocate',
        allocations: [
          {
            targetType: 'project',
            projectId: projectA.projectId,
            method: 'manual_amount',
            amount: '30000',
            sortOrder: 0,
          },
          {
            targetType: 'project',
            projectId: projectB.projectId,
            method: 'manual_amount',
            amount: '50000',
            sortOrder: 1,
          },
          {
            targetType: 'project',
            projectId: projectC.projectId,
            method: 'manual_amount',
            amount: '20000',
            sortOrder: 2,
          },
        ],
      });
      await finalizeExpense(context, expense.id);

      const refreshed = await getExpense(context, expense.id);
      expect(refreshed.vendorId).toBe(vendor.id);

      for (const [projectId, expected] of [
        [projectA.projectId, '30000.000000'],
        [projectB.projectId, '50000.000000'],
        [projectC.projectId, '20000.000000'],
      ] as const) {
        const contributions = await loadProjectExpenseContributions(tx, orgAId, projectId);
        const { cost } = aggregateProjectCosts(contributions, null, 'ILS');
        expect(cost.actualCostToDate.amount).toBe(expected);
      }
    });
  });

  it('expense integrity audit auto-repairs draft anomalies to zero actionable issues', async () => {
    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });
      const { auditExpenseIntegrity, repairExpenseIntegrityIssues } = await import(
        '@/modules/expenses/application/expense-integrity-audit'
      );
      const before = await auditExpenseIntegrity(context);
      const repairable = before.issues.filter((issue) => issue.autoRepairable);
      if (repairable.length > 0) {
        await repairExpenseIntegrityIssues(context, repairable);
      }
      const after = await auditExpenseIntegrity(context);
      const actionable = after.issues.filter((issue) => issue.autoRepairable || issue.ambiguous);
      expect(actionable).toHaveLength(0);
    });
  });

  it('preserves the original creator when a draft expense is edited', async () => {
    const editor = await createTestUser(database, 'editor-a@example.test');

    await database.asService(async (db) => {
      const membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgAId,
        userId: editor.id,
        status: 'active',
      });
      const ownerRole = await findRoleByKey(db, orgAId, 'owner');
      if (!ownerRole) throw new Error('Owner role not found');
      await assignRole(db, {
        organizationId: orgAId,
        membershipId,
        userId: editor.id,
        roleId: ownerRole.id,
      });
    });

    const expenseId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });
      const expense = await createExpense(context, {
        amount: '200',
        currency: 'ILS',
        projectId: orgAProjectId,
        description: 'Original',
      });
      expect(expense.createdByUserId).toBe(userA.id);
      return expense.id;
    });

    await database.asUser(editor.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: editor.id,
        organizationId: orgAId,
        locale: 'en',
      });
      const updated = await updateExpense(context, {
        expenseId,
        amount: '250',
        currency: 'ILS',
        projectId: orgAProjectId,
        description: 'Edited',
      });
      expect(updated.createdByUserId).toBe(userA.id);
      expect(updated.description).toBe('Edited');
    });
  });
});
