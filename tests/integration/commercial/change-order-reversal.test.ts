import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  allocateApprovedChangeToBoq,
  listChangeAllocationsForChangeOrder,
} from '@/modules/boq';
import {
  approveChangeRequest,
  createChangeRequest,
  getChangeRequestDetail,
  getProjectCommercialSummary,
  reverseChangeOrder,
  submitChangeRequestForApproval,
} from '@/modules/commercial';
import { createProject } from '@/modules/projects';
import { ConflictError, DomainRuleError } from '@/shared/errors';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

describe('change order commercial reversal', () => {
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

  async function seedApprovedChange(
    userId: string,
    organizationId: string,
    title = 'Approved extras',
    amount = '5000',
  ) {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Reversal job',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      const change = await createChangeRequest(context, {
        projectId,
        title,
        direction: 'addition',
        requestedAmount: amount,
      });
      await submitChangeRequestForApproval(context, change.changeRequestId);
      const approved = await approveChangeRequest(context, {
        changeRequestId: change.changeRequestId,
        effectiveDate: '2026-08-01',
      });
      const before = await getProjectCommercialSummary(context, projectId);
      return {
        context,
        projectId,
        changeRequestId: change.changeRequestId,
        changeOrderId: approved.changeOrderId,
        beforeCcv: before?.position.currentContractValue.amount,
      };
    });
  }

  it('returns current contract value to the original after reversal', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedApprovedChange(userA.id, orgA.organization.id);
    expect(seeded.beforeCcv).toBe('105000.000000');

    const after = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const reversal = await reverseChangeOrder(context, {
        changeOrderId: seeded.changeOrderId,
        reason: 'Client cancelled the extra work',
        effectiveDate: '2026-08-14',
      });
      const summary = await getProjectCommercialSummary(context, seeded.projectId);
      const detail = await getChangeRequestDetail(context, seeded.changeRequestId);
      return { reversal, summary, detail };
    });

    expect(after.reversal.reference).toMatch(/^CO-\d{3}$/);
    expect(after.summary?.position.currentContractValue.amount).toBe('100000.000000');
    expect(after.detail.changeOrder?.id).toBe(seeded.changeOrderId);
    expect(after.detail.changeOrder?.direction).toBe('addition');
    expect(after.detail.changeOrder?.amount).toBe('5000.000000');
    expect(after.detail.changeOrder?.reversalOfChangeOrderId).toBeNull();
    expect(after.detail.reversingChangeOrder?.id).toBe(after.reversal.reversalChangeOrderId);
    expect(after.detail.reversingChangeOrder?.direction).toBe('reduction');
    expect(after.detail.reversingChangeOrder?.reversalOfChangeOrderId).toBe(seeded.changeOrderId);
  });

  it('reverses BOQ allocations before inserting the reversing change order', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedApprovedChange(userA.id, orgA.organization.id, 'BOQ extras', '8000');

    const { boqId, nodeId } = await database.asService(async (db) => {
      const boq = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgA.organization.id}::uuid, ${seeded.projectId}::uuid, 1, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      const node = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_nodes (
            organization_id, boq_id, node_kind, description, pricing_type,
            original_quantity, original_unit_price, original_amount,
            current_quantity, current_unit_price, current_amount
          ) VALUES (
            ${orgA.organization.id}::uuid, ${boq[0]!.id}::uuid, 'item', 'Extra sockets', 'quantity_unit_price',
            1, 8000, 8000, 1, 8000, 8000
          ) RETURNING id
        `),
      );
      return { boqId: boq[0]!.id, nodeId: node[0]!.id };
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });

      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });

      await tx.execute(
        sql`SELECT app.activate_project_boq(${orgA.organization.id}::uuid, ${boqId}::uuid)`,
      );

      await allocateApprovedChangeToBoq(context, {
        boqId,
        changeOrderId: seeded.changeOrderId,
        allocations: [
          {
            allocationKind: 'quantity_change',
            boqNodeId: nodeId,
            quantityDelta: '1',
            amountDelta: '8000',
          },
        ],
      });

      const reversal = await reverseChangeOrder(context, {
        changeOrderId: seeded.changeOrderId,
        reason: 'Scope removed after allocation',
      });

      const allocations = await listChangeAllocationsForChangeOrder(
        context.db,
        context.organizationId,
        seeded.changeOrderId,
      );
      const sources = allocations.filter((row) => !row.reversesAllocationId);
      const reversals = allocations.filter((row) => row.reversesAllocationId);
      expect(sources.length).toBe(1);
      expect(reversals.length).toBe(1);
      expect(reversals[0]?.reversesAllocationId).toBe(sources[0]?.id);
      expect(reversals[0]?.allocationKind).toBe('reversal');

      const summary = await getProjectCommercialSummary(context, seeded.projectId);
      expect(summary?.position.currentContractValue.amount).toBe('100000.000000');
      expect(reversal.reversalChangeOrderId).toBeTruthy();
    });
  });

  it('refuses to reverse a reversing change order', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedApprovedChange(userA.id, orgA.organization.id);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const reversal = await reverseChangeOrder(context, {
        changeOrderId: seeded.changeOrderId,
        reason: 'First reversal',
      });
      await expect(
        reverseChangeOrder(context, {
          changeOrderId: reversal.reversalChangeOrderId,
          reason: 'Second reversal',
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('refuses to reverse the same change order twice', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedApprovedChange(userA.id, orgA.organization.id);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await reverseChangeOrder(context, {
        changeOrderId: seeded.changeOrderId,
        reason: 'First reversal',
      });
      await expect(
        reverseChangeOrder(context, {
          changeOrderId: seeded.changeOrderId,
          reason: 'Second reversal',
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it('lets changes.approve reverse its own CO allocations but not an arbitrary BOQ allocation', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const seeded = await seedApprovedChange(userA.id, orgA.organization.id, 'Approve-only extras', '8000');
    const approver = await createTestUser(database, `co-approver-${Date.now()}@example.test`);

    const { boqId, nodeId, allocationId } = await (async () => {
      const created = await database.asService(async (db) => {
        const boq = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
            VALUES (${orgA.organization.id}::uuid, ${seeded.projectId}::uuid, 1, 'ILS', 'draft', 'simple')
            RETURNING id
          `),
        );
        const node = resultRows<{ id: string }>(
          await db.execute(sql`
            INSERT INTO boq_nodes (
              organization_id, boq_id, node_kind, description, pricing_type,
              original_quantity, original_unit_price, original_amount,
              current_quantity, current_unit_price, current_amount
            ) VALUES (
              ${orgA.organization.id}::uuid, ${boq[0]!.id}::uuid, 'item', 'Extra sockets', 'quantity_unit_price',
              1, 8000, 8000, 1, 8000, 8000
            ) RETURNING id
          `),
        );
        return { boqId: boq[0]!.id, nodeId: node[0]!.id };
      });

      return database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'he-IL',
        });
        await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
        await tx.execute(
          sql`SELECT app.activate_project_boq(${orgA.organization.id}::uuid, ${created.boqId}::uuid)`,
        );
        await allocateApprovedChangeToBoq(context, {
          boqId: created.boqId,
          changeOrderId: seeded.changeOrderId,
          allocations: [
            {
              allocationKind: 'quantity_change',
              boqNodeId: created.nodeId,
              quantityDelta: '1',
              amountDelta: '8000',
            },
          ],
        });
        const alloc = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT id FROM boq_change_allocations
            WHERE change_order_id = ${seeded.changeOrderId}::uuid
              AND allocation_kind IS DISTINCT FROM 'reversal'
            LIMIT 1
          `),
        );
        return { boqId: created.boqId, nodeId: created.nodeId, allocationId: alloc[0]!.id };
      });
    })();

    await database.asService(async (db) => {
      const role = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO roles (organization_id, key, name, rank, is_protected)
          VALUES (${orgA.organization.id}::uuid, 'co_approver', 'CO approver', 80, false)
          RETURNING id
        `),
      );
      for (const key of [
        'org.read',
        'projects.read',
        'changes.read',
        'changes.approve',
        'contracts.read',
        'boq.read',
      ]) {
        await db.execute(sql`
          INSERT INTO role_permissions (organization_id, role_id, permission_key)
          VALUES (${orgA.organization.id}::uuid, ${role[0]!.id}::uuid, ${key})
        `);
      }
      const membership = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO organization_memberships (organization_id, user_id, status)
          VALUES (${orgA.organization.id}::uuid, ${approver.id}::uuid, 'active')
          RETURNING id
        `),
      );
      await db.execute(sql`
        INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
        VALUES (
          ${orgA.organization.id}::uuid,
          ${membership[0]!.id}::uuid,
          ${approver.id}::uuid,
          ${role[0]!.id}::uuid
        )
      `);
    });

    await database.asUser(approver.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_reverse_change_allocation(
            ${orgA.organization.id}::uuid,
            ${allocationId}::uuid
          )
        `),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          message: expect.stringMatching(/boq.manage|insufficient_privilege/i),
        }),
      });
    });

    await database.asUser(approver.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_reverse_allocations_for_change_order(
            ${orgA.organization.id}::uuid,
            ${seeded.changeOrderId}::uuid,
            'standalone'
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(approver.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: approver.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await reverseChangeOrder(context, {
        changeOrderId: seeded.changeOrderId,
        reason: 'Canonical commercial reversal',
      });
      const allocations = await listChangeAllocationsForChangeOrder(
        tx,
        orgA.organization.id,
        seeded.changeOrderId,
      );
      expect(allocations.some((row) => row.reversesAllocationId === allocationId)).toBe(true);
    });

    void boqId;
    void nodeId;
  });
});
