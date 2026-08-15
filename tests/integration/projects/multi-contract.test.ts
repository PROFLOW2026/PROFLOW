import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createBillingRecord } from '@/modules/billing';
import { createProjectBoq } from '@/modules/boq';
import { loadProjectCommercialData } from '@/modules/financials';
import {
  createAdditionalContract,
  createProject,
  getProjectDetail,
  listProjectContracts,
} from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

function errorBlob(error: unknown): string {
  if (!error) return '';
  if (typeof error !== 'object') return String(error);
  const e = error as {
    message?: string;
    cause?: unknown;
    detail?: string;
    code?: string;
    hint?: string;
    error?: unknown;
  };
  return [e.message, e.detail, e.code, e.hint, errorBlob(e.cause), errorBlob(e.error)]
    .filter(Boolean)
    .join('\n');
}

describe('multi-contract projects', () => {
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

  it('keeps the original primary when an additional contract is added', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Two-contract site',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      const primaryBefore = (await getProjectDetail(context, projectId)).contract;
      const additional = await createAdditionalContract(context, {
        projectId,
        name: 'Facade package',
        enteredAmount: '40000',
        currency: 'ILS',
        amountIncludesTax: false,
      });
      const listed = await listProjectContracts(context, { projectId });
      const detail = await getProjectDetail(context, projectId);
      const commercial = await loadProjectCommercialData(
        context.db,
        context.organizationId,
        projectId,
      );
      return { primaryBefore, additional, listed, detail, commercial };
    });

    expect(result.primaryBefore?.isPrimary).toBe(true);
    expect(result.additional.isPrimary).toBe(false);
    expect(result.detail.contract?.id).toBe(result.primaryBefore?.id);
    expect(result.detail.contract?.isPrimary).toBe(true);
    expect(result.listed).toHaveLength(2);
    expect(result.listed.filter((row) => row.contract.isPrimary)).toHaveLength(1);
    expect(result.commercial?.perContract).toHaveLength(2);
    expect(result.commercial?.position.originalContractValue.amount).toBe('140000.000000');
    expect(result.commercial?.position.currentContractValue.amount).toBe('140000.000000');
    expect(result.detail.currentContractValue?.amount).toBe('140000.000000');
  });

  it('rejects a BOQ contract from another organization', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const seeded = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'Org A project',
        contractValueAmount: '10000',
        amountIncludesTax: false,
      });
      const detail = await getProjectDetail(context, projectId);
      return { projectId, contractId: detail.contract!.id };
    });

    const otherProjectId = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      const created = await createProject(context, {
        name: 'Org B project',
        contractValueAmount: '8000',
        amountIncludesTax: false,
      });
      return created.projectId;
    });

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO project_boqs (
            organization_id, project_id, contract_id, version_number, currency, status, progress_mode
          ) VALUES (
            ${orgB.organization.id}::uuid,
            ${otherProjectId}::uuid,
            ${seeded.contractId}::uuid,
            1, 'ILS', 'draft', 'simple'
          )
        `);
      }),
    ).rejects.toThrow();
  });

  it('rejects billing linked to a contract on a different project (0046 guard)', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const ids = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const first = await createProject(context, {
        name: 'Project one',
        contractValueAmount: '10000',
        amountIncludesTax: false,
      });
      const second = await createProject(context, {
        name: 'Project two',
        contractValueAmount: '20000',
        amountIncludesTax: false,
      });
      const firstDetail = await getProjectDetail(context, first.projectId);
      return {
        projectTwoId: second.projectId,
        contractOneId: firstDetail.contract!.id,
      };
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return createBillingRecord(context, {
          projectId: ids.projectTwoId,
          contractId: ids.contractOneId,
          amount: '1000',
          issueDate: '2026-08-01',
        });
      }),
    ).rejects.toThrow();

    await expect(
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, contract_id, kind, issue_date,
            subtotal_amount, total_amount, currency, status, source_kind
          ) VALUES (
            ${orgA.organization.id}::uuid,
            ${ids.projectTwoId}::uuid,
            ${ids.contractOneId}::uuid,
            'invoice', '2026-08-01',
            1000, 1000, 'ILS', 'draft', 'manual'
          )
        `);
      }),
    ).rejects.toSatisfy((error) => /same project|Failed query/i.test(errorBlob(error)));
  });

  it('stores contractId on a BOQ for the same-project additional contract', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const boq = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, {
        name: 'BOQ scoped',
        contractValueAmount: '50000',
        amountIncludesTax: false,
      });
      const additional = await createAdditionalContract(context, {
        projectId,
        name: 'Electrical package',
        enteredAmount: '12000',
        currency: 'ILS',
      });
      return createProjectBoq(context, {
        projectId,
        contractId: additional.id,
      });
    });

    expect(boq?.contractId).toBeTruthy();
  });
});
