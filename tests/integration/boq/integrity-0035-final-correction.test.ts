import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { organizationMemberships } from '@drizzle/schema';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { insertDraftBoqNodeViaRpc } from '../../setup/boq-draft-node';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { validateBoqItems } from '@/modules/imports/validation/validate-rows';

/**
 * Final integrity correction adversarial suite (0035 section 11).
 */
describe('BOQ final integrity correction adversarial', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  async function provisionTwoOrgs() {
    const ownerA = await createTestUser(database, `boq-a-${Date.now()}@example.test`);
    const ownerB = await createTestUser(database, `boq-b-${Date.now()}@example.test`);
    const workerA = await createTestUser(database, `boq-w-${Date.now()}@example.test`);
    const orgA = await createTestOrganization(database, ownerA, 'Org A Integrity');
    const orgB = await createTestOrganization(database, ownerB, 'Org B Integrity');

    const projectA = await database.asUser(ownerA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      const workerRole = await findRoleByKey(tx, context.organizationId, 'worker');
      if (!workerRole) throw new Error('worker role missing');
      const [membership] = await tx
        .insert(organizationMemberships)
        .values({
          organizationId: context.organizationId,
          userId: workerA.id,
          status: 'active',
        })
        .returning({ id: organizationMemberships.id });
      await assignRole(tx, {
        organizationId: context.organizationId,
        membershipId: membership!.id,
        userId: workerA.id,
        roleId: workerRole.id,
      });
      const client = await createClient(context, { name: 'Client A' });
      const project = await createProject(context, {
        name: 'Project A',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });

    const projectB = await database.asUser(ownerB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      const client = await createClient(context, { name: 'Client B' });
      const project = await createProject(context, {
        name: 'Project B',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });

    return {
      ownerA,
      ownerB,
      workerA,
      orgAId: orgA.organization.id,
      orgBId: orgB.organization.id,
      projectA,
      projectB,
    };
  }

  async function seedActiveBoq(
    userId: string,
    orgId: string,
    projectId: string,
  ): Promise<{ boqId: string; nodeId: string }> {
    return database.asUser(userId, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      const nodeId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Point',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)`);
      return { boqId: boq[0]!.id, nodeId };
    });
  }

  it('ChangeRequest without ChangeOrder cannot allocate; existing ChangeOrder can', async () => {
    const { ownerA, orgAId, projectA } = await provisionTwoOrgs();
    const { boqId, nodeId } = await seedActiveBoq(ownerA.id, orgAId, projectA);

    const contractId = await database.asUser(ownerA.id, async (tx) => {
      const contracts = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM contracts WHERE organization_id = ${orgAId}::uuid AND project_id = ${projectA}::uuid LIMIT 1
        `),
      );
      let id = contracts[0]?.id;
      if (!id) {
        const created = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO contracts (organization_id, project_id, currency, original_value_amount)
            VALUES (${orgAId}::uuid, ${projectA}::uuid, 'ILS', 100000)
            RETURNING id
          `),
        );
        id = created[0]!.id;
      }
      await tx.execute(sql`
        INSERT INTO change_requests (
          organization_id, project_id, contract_id, title, status, direction, currency
        ) VALUES (
          ${orgAId}::uuid, ${projectA}::uuid, ${id}::uuid,
          'Pending only', 'awaiting_approval', 'addition', 'ILS'
        )
      `);
      return id;
    });

    await database.asUser(ownerA.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgAId}::uuid, ${boqId}::uuid, gen_random_uuid(),
            'quantity_change', ${nodeId}::uuid, 1, 0, 100, 'no-co', NULL
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(ownerA.id, async (tx) => {
      const approved = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, ${contractId}::uuid, 'addition', 500, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );

      const ok = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgAId}::uuid, ${boqId}::uuid, ${approved[0]!.id}::uuid,
            'quantity_change', ${nodeId}::uuid, 1, 0, 100, 'ok', NULL
          ) AS id
        `),
      );
      expect(ok[0]?.id).toBeTruthy();
    });
  });

  it('blocks cross-tenant secure view leakage', async () => {
    const { ownerA, ownerB, workerA, orgAId, orgBId, projectA, projectB } = await provisionTwoOrgs();
    const a = await seedActiveBoq(ownerA.id, orgAId, projectA);
    const b = await seedActiveBoq(ownerB.id, orgBId, projectB);

    await database.asUser(ownerA.id, async (tx) => {
      const mine = resultRows(
        await tx.execute(sql`SELECT id FROM boq_nodes_secure WHERE id = ${a.nodeId}::uuid`),
      );
      expect(mine.length).toBe(1);
      const foreign = resultRows(
        await tx.execute(sql`SELECT id, description FROM boq_nodes_secure WHERE id = ${b.nodeId}::uuid`),
      );
      expect(foreign.length).toBe(0);
      const foreignAlloc = resultRows(
        await tx.execute(sql`
          SELECT id FROM boq_change_allocations_secure WHERE organization_id = ${orgBId}::uuid
        `),
      );
      expect(foreignAlloc.length).toBe(0);
      const foreignProg = resultRows(
        await tx.execute(sql`
          SELECT id FROM boq_progress_lines_secure WHERE organization_id = ${orgBId}::uuid
        `),
      );
      expect(foreignProg.length).toBe(0);
    });

    await database.asUser(workerA.id, async (tx) => {
      const masked = resultRows<{ current_unit_price: string }>(
        await tx.execute(sql`
          SELECT current_unit_price::text FROM boq_nodes_secure WHERE id = ${a.nodeId}::uuid
        `),
      );
      expect(Number(masked[0]?.current_unit_price ?? '1')).toBe(0);
      await expect(
        tx.execute(sql`SELECT current_unit_price FROM boq_nodes WHERE id = ${a.nodeId}::uuid`),
      ).rejects.toThrow();
    });

    await database.asUser(ownerB.id, async (tx) => {
      const leaked = resultRows(
        await tx.execute(sql`SELECT id FROM boq_nodes_secure WHERE organization_id = ${orgAId}::uuid`),
      );
      expect(leaked.length).toBe(0);
    });
  });

  it('blocks authenticated claim/link/revert primitives; finalize works', async () => {
    const { ownerA, orgAId, projectA } = await provisionTwoOrgs();
    const { boqId, nodeId } = await seedActiveBoq(ownerA.id, orgAId, projectA);

    const batchId = await database.asUser(ownerA.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, ${boqId}::uuid, 1, 'P1', 'draft'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgAId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 2,
          0, 0, 0, 0, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgAId}::uuid, ${batch[0]!.id}::uuid)`);
      return batch[0]!.id;
    });

    await database.asUser(ownerA.id, async (tx) => {
      await expect(
        tx.execute(sql`SELECT app.claim_boq_progress_batch_for_billing(${orgAId}::uuid, ${batchId}::uuid)`),
      ).rejects.toThrow();
    });
    await database.asUser(ownerA.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.insert_boq_progress_billing_link(
            ${orgAId}::uuid, ${batchId}::uuid, ${batchId}::uuid, 200, 'ILS'
          )
        `),
      ).rejects.toThrow();
    });
    await database.asUser(ownerA.id, async (tx) => {
      await expect(
        tx.execute(sql`SELECT app.revert_boq_progress_batch_billing_claim(${orgAId}::uuid, ${batchId}::uuid)`),
      ).rejects.toThrow();
    });

    await database.asUser(ownerA.id, async (tx) => {
      const status = resultRows<{ status: string }>(
        await tx.execute(sql`SELECT status FROM boq_progress_batches WHERE id = ${batchId}::uuid`),
      );
      expect(status[0]?.status).toBe('approved');
    });
  });

  it('blocks node BOQ reassignment and active BOQ identity mutation', async () => {
    const { ownerA, orgAId, projectA } = await provisionTwoOrgs();
    const { boqId, nodeId } = await seedActiveBoq(ownerA.id, orgAId, projectA);

    const draftBoqId = await database.asUser(ownerA.id, async (tx) => {
      const draft = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgAId}::uuid, ${projectA}::uuid, 2, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      return draft[0]!.id;
    });

    await database.asUser(ownerA.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_nodes SET boq_id = ${draftBoqId}::uuid WHERE id = ${nodeId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          UPDATE boq_nodes SET description = 'hacked' WHERE id = ${nodeId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          UPDATE project_boqs SET project_id = ${projectA}::uuid, currency = 'USD' WHERE id = ${boqId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          UPDATE project_boqs SET activated_at = now() - interval '1 day' WHERE id = ${boqId}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks cross-schedule valuation lines', async () => {
    const { ownerA, orgAId, projectA } = await provisionTwoOrgs();
    const { boqId, nodeId } = await seedActiveBoq(ownerA.id, orgAId, projectA);

    await database.asService(async (db) => {
      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name)
          VALUES (${orgAId}::uuid, 'Sub Vendor')
          RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgAId}::uuid, ${vendor[0]!.id}::uuid, ${projectA}::uuid, 'active')
          RETURNING id
        `),
      );
      const s1 = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const s2 = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const line2 = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (
            ${orgAId}::uuid, ${s2[0]!.id}::uuid, ${nodeId}::uuid, 1, 10, 10, 'ILS'
          ) RETURNING id
        `),
      );
      const val1 = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (
            ${orgAId}::uuid, ${s1[0]!.id}::uuid, 'P1', 'draft'
          ) RETURNING id
        `),
      );
      await expect(
        db.execute(sql`
          INSERT INTO boq_subcontractor_valuation_lines (
            organization_id, valuation_id, schedule_line_id,
            previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
          ) VALUES (
            ${orgAId}::uuid, ${val1[0]!.id}::uuid, ${line2[0]!.id}::uuid,
            0, 1, 10, 10, 'ILS'
          )
        `),
      ).rejects.toThrow();
    });
  });

  it('releases billed batch after AR void then allows supersede', async () => {
    const { ownerA, orgAId, projectA } = await provisionTwoOrgs();
    const { boqId, nodeId } = await seedActiveBoq(ownerA.id, orgAId, projectA);

    const ids = await database.asUser(ownerA.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, ${boqId}::uuid, 1, 'P1', 'draft'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgAId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 2,
          0, 0, 0, 0, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgAId}::uuid, ${batch[0]!.id}::uuid)`);
      return { batchId: batch[0]!.id };
    });

    const billingId = await database.asService(async (db) => {
      const bill = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, kind, status, issue_date,
            subtotal_amount, total_amount, currency, retention_amount, retention_held_remaining
          ) VALUES (
            ${orgAId}::uuid, ${projectA}::uuid, 'invoice', 'finalized', CURRENT_DATE,
            200, 200, 'ILS', 0, 0
          ) RETURNING id
        `),
      );
      return bill[0]!.id;
    });

    await database.asUser(ownerA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.finalize_boq_progress_billing(
          ${orgAId}::uuid, ${ids.batchId}::uuid, ${billingId}::uuid, 200, 'ILS'
        )
      `);
    });

    await database.asService(async (db) => {
      await db.execute(sql`
        UPDATE billing_records SET status = 'void', voided_at = now()
        WHERE id = ${billingId}::uuid
      `);
      const batch = resultRows<{ status: string }>(
        await db.execute(sql`SELECT status FROM boq_progress_batches WHERE id = ${ids.batchId}::uuid`),
      );
      expect(batch[0]?.status).toBe('approved');
      const link = resultRows<{ voided_at: string | null }>(
        await db.execute(sql`
          SELECT voided_at::text FROM boq_progress_billing_links
          WHERE progress_batch_id = ${ids.batchId}::uuid
        `),
      );
      expect(link[0]?.voided_at).toBeTruthy();
    });

    await database.asUser(ownerA.id, async (tx) => {
      const newId = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.supersede_boq_progress_batch(${orgAId}::uuid, ${ids.batchId}::uuid, 'P1-fix') AS id
        `),
      );
      expect(newId[0]?.id).toBeTruthy();
      const old = resultRows<{ status: string }>(
        await tx.execute(sql`SELECT status FROM boq_progress_batches WHERE id = ${ids.batchId}::uuid`),
      );
      expect(old[0]?.status).toBe('superseded');
    });
  });

  it('localizes BOQ import preview validation for he/en', () => {
    const en = validateBoqItems({ description: '', quantity: 'x' }, 'en');
    expect(en.some((i) => i.message.includes('required'))).toBe(true);
    const he = validateBoqItems({ description: '', quantity: 'x' }, 'he-IL');
    expect(he.some((i) => i.message.includes('חובה'))).toBe(true);
    expect(he.every((i) => !/description is required/i.test(i.message))).toBe(true);
  });
});
