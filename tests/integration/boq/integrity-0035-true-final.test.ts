import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { organizationMemberships } from '@drizzle/schema';
import { createBillingRecordWithPermission } from '@/modules/billing';
import { finalizeProgressBillingRpc } from '@/modules/boq/data/boq.repository';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { insertDraftBoqNodeViaRpc } from '../../setup/boq-draft-node';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

/**
 * TRUE FINAL CLOSURE adversarial matrix (0035 Â§12).
 * Does not rely on the prior PASS suite that missed these cases.
 */
describe('BOQ true-final integrity closure adversarial', () => {
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

  async function provision() {
    const owner = await createTestUser(database, `tf-owner-${Date.now()}@example.test`);
    const worker = await createTestUser(database, `tf-worker-${Date.now()}@example.test`);
    const other = await createTestUser(database, `tf-other-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'True Final Org');
    const orgB = await createTestOrganization(database, other, 'True Final Org B');

    const seeded = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      const workerRole = await findRoleByKey(tx, context.organizationId, 'worker');
      if (!workerRole) throw new Error('worker role missing');
      const [membership] = await tx
        .insert(organizationMemberships)
        .values({
          organizationId: context.organizationId,
          userId: worker.id,
          status: 'active',
        })
        .returning({ id: organizationMemberships.id });
      await assignRole(tx, {
        organizationId: context.organizationId,
        membershipId: membership!.id,
        userId: worker.id,
        roleId: workerRole.id,
      });
      const client = await createClient(context, { name: 'Client TF' });
      const project = await createProject(context, {
        name: 'Project TF',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      const project2 = await createProject(context, {
        name: 'Project TF2',
        clientId: client.id,
        contractValueAmount: '50000',
        status: 'active',
      });
      return { projectId: project.projectId, project2Id: project2.projectId };
    });

    const projectB = await database.asUser(other.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: other.id,
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
      owner,
      worker,
      other,
      orgId: org.organization.id,
      orgBId: orgB.organization.id,
      projectId: seeded.projectId,
      project2Id: seeded.project2Id,
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
        description: 'Item',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)`);
      return { boqId: boq[0]!.id, nodeId };
    });
  }

  async function ensureContract(userId: string, orgId: string, projectId: string) {
    return database.asUser(userId, async (tx) => {
      const existing = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM contracts
          WHERE organization_id = ${orgId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `),
      );
      if (existing[0]?.id) return existing[0].id;
      const created = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO contracts (organization_id, project_id, currency, original_value_amount)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 'ILS', 100000)
          RETURNING id
        `),
      );
      return created[0]!.id;
    });
  }

  it('asserts no parallel change_orders.status lifecycle column', async () => {
    const cols = await database.asService(async (db) =>
      resultRows<{ column_name: string }>(
        await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'change_orders' AND column_name = 'status'
        `),
      ),
    );
    expect(cols.length).toBe(0);
  });

  it('ChangeRequest pending/rejected cannot allocate; approved ChangeOrder can', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);
    const contractId = await ensureContract(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        INSERT INTO change_requests (
          organization_id, project_id, contract_id, title, status, direction, currency
        ) VALUES (
          ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid,
          'Pending CR', 'awaiting_approval', 'addition', 'ILS'
        )
      `);
      await tx.execute(sql`
        INSERT INTO change_requests (
          organization_id, project_id, contract_id, title, status, direction, currency
        ) VALUES (
          ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid,
          'Rejected CR', 'rejected', 'addition', 'ILS'
        )
      `);
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, gen_random_uuid(),
            'quantity_change', ${nodeId}::uuid, 1, 0, 100, 'pending-cr', NULL
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      const co = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid, 'addition', 500, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      const ok = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${co[0]!.id}::uuid,
            'quantity_change', ${nodeId}::uuid, 1, 0, 100, 'approved-co', NULL
          ) AS id
        `),
      );
      expect(ok[0]?.id).toBeTruthy();
    });
  });

  it('blocks worker direct SELECT of subcontractor money columns', async () => {
    const { owner, worker, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asService(async (db) => {
      const vendor = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'Sub') RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'active')
          RETURNING id
        `),
      );
      const sched = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 2, 50, 100, 'ILS'
          ) RETURNING id
        `),
      );
      const val = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P1', 'draft')
          RETURNING id
        `),
      );
      const vline = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO boq_subcontractor_valuation_lines (
            organization_id, valuation_id, schedule_line_id,
            previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${val[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 1, 50, 50, 'ILS'
          ) RETURNING id
        `),
      );
      return { lineId: line[0]!.id, vlineId: vline[0]!.id, vendorId: vendor[0]!.id };
    });

    await database.asUser(worker.id, async (tx) => {
      await expect(
        tx.execute(sql`SELECT unit_rate FROM boq_subcontractor_schedule_lines WHERE id = ${ids.lineId}::uuid`),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`SELECT amount FROM boq_subcontractor_schedule_lines WHERE id = ${ids.lineId}::uuid`),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          SELECT unit_rate_snapshot FROM boq_subcontractor_valuation_lines WHERE id = ${ids.vlineId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          SELECT period_amount FROM boq_subcontractor_valuation_lines WHERE id = ${ids.vlineId}::uuid
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      const money = resultRows<{ unit_rate: string; amount: string }>(
        await tx.execute(sql`
          SELECT unit_rate::text, amount::text
          FROM boq_subcontractor_schedule_lines_secure WHERE id = ${ids.lineId}::uuid
        `),
      );
      expect(Number(money[0]?.unit_rate)).toBe(50);
      expect(Number(money[0]?.amount)).toBe(100);
    });
  });

  it('locks active subcontractor schedule and lines', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'Sub2') RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'active')
          RETURNING id
        `),
      );
      const sched = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 3, 10, 999, 'ILS'
          ) RETURNING id
        `),
      );
      const math = resultRows<{ amount: string }>(
        await tx.execute(sql`
          SELECT amount::text FROM boq_subcontractor_schedule_lines_secure WHERE id = ${line[0]!.id}::uuid
        `),
      );
      // Canonical math overrides client amount
      expect(Number(math[0]!.amount)).toBe(30);
      await tx.execute(sql`
        SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)
      `);
      return { schedId: sched[0]!.id, lineId: line[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_schedules SET status = 'draft' WHERE id = ${ids.schedId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_schedule_lines SET unit_rate = 1 WHERE id = ${ids.lineId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          DELETE FROM boq_subcontractor_schedule_lines WHERE id = ${ids.lineId}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('locks approved valuation lines and blocks hard delete', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'Sub3') RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'active')
          RETURNING id
        `),
      );
      const sched = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 5, 20, 100, 'ILS'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)
      `);
      const val = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P1', 'draft')
          RETURNING id
        `),
      );
      const vline = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuation_lines (
            organization_id, valuation_id, schedule_line_id,
            previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${val[0]!.id}::uuid, ${line[0]!.id}::uuid,
            0, 2, 999, 1, 'USD'
          ) RETURNING id
        `),
      );
      const derived = resultRows<{ period_amount: string; unit_rate_snapshot: string }>(
        await tx.execute(sql`
          SELECT period_amount::text, unit_rate_snapshot::text
          FROM boq_subcontractor_valuation_lines_secure WHERE id = ${vline[0]!.id}::uuid
        `),
      );
      // Canonical snapshot/amount from schedule (not client-supplied)
      expect(Number(derived[0]!.unit_rate_snapshot)).toBe(20);
      expect(Number(derived[0]!.period_amount)).toBe(40);
      await tx.execute(sql`
        SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${val[0]!.id}::uuid)
      `);
      return { valId: val[0]!.id, vlineId: vline[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuation_lines SET approved_quantity = 9 WHERE id = ${ids.vlineId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          DELETE FROM boq_subcontractor_valuation_lines WHERE id = ${ids.vlineId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          DELETE FROM boq_subcontractor_valuations WHERE id = ${ids.valId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations SET status = 'draft' WHERE id = ${ids.valId}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('requires proposed AP bill same project and currency', async () => {
    const { owner, orgId, projectId, project2Id } = await provision();
    const { boqId } = await seedActiveBoq(owner.id, orgId, projectId);

    const seeded = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'APV') RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'active')
          RETURNING id
        `),
      );
      const sched = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const wrongProjectBill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, project_id, status, currency, total_amount)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${project2Id}::uuid, 'draft', 'ILS', 100)
          RETURNING id
        `),
      );
      const wrongCurrencyBill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, project_id, status, currency, total_amount)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'draft', 'USD', 100)
          RETURNING id
        `),
      );
      const goodBill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, project_id, status, currency, total_amount)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'draft', 'ILS', 100)
          RETURNING id
        `),
      );
      return {
        schedId: sched[0]!.id,
        wrongProjectBillId: wrongProjectBill[0]!.id,
        wrongCurrencyBillId: wrongCurrencyBill[0]!.id,
        goodBillId: goodBill[0]!.id,
      };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status, proposed_vendor_bill_id
          ) VALUES (
            ${orgId}::uuid, ${seeded.schedId}::uuid, 'WP', 'draft', ${seeded.wrongProjectBillId}::uuid
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status, proposed_vendor_bill_id
          ) VALUES (
            ${orgId}::uuid, ${seeded.schedId}::uuid, 'WC', 'draft', ${seeded.wrongCurrencyBillId}::uuid
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status, proposed_vendor_bill_id
          ) VALUES (
            ${orgId}::uuid, ${seeded.schedId}::uuid, 'OK', 'draft', ${seeded.goodBillId}::uuid
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      const draft = resultRows<{ id: string; proposed_vendor_bill_id: string | null }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (
            ${orgId}::uuid, ${seeded.schedId}::uuid, 'OK', 'draft'
          ) RETURNING id, proposed_vendor_bill_id
        `),
      );
      expect(draft[0]?.id).toBeTruthy();
      expect(draft[0]?.proposed_vendor_bill_id).toBeNull();
    });
  });

  it('preserves measured≠approved in secure progress view for workers', async () => {
    const { owner, worker, orgId, projectId } = await provision();

    const lineId = await database.asUser(owner.id, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'advanced')
          RETURNING id
        `),
      );
      const nodeId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Item',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)`);

      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boq[0]!.id}::uuid, 1, 'M10A4', 'draft'
          ) RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_lines (
            organization_id, batch_id, boq_node_id, measured_quantity,
            previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid,
            10, 0, 0, 0, 0, 'ILS'
          ) RETURNING id
        `),
      );
      const approvals = JSON.stringify({ [line[0]!.id]: '4' });
      await tx.execute(sql`
        SELECT app.approve_boq_progress_batch(
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${approvals}::jsonb
        )
      `);
      return line[0]!.id;
    });

    await database.asUser(worker.id, async (tx) => {
      const row = resultRows<{ measured_quantity: string; approved_quantity: string }>(
        await tx.execute(sql`
          SELECT measured_quantity::text, approved_quantity::text
          FROM boq_progress_lines_secure WHERE id = ${lineId}::uuid
        `),
      );
      expect(Number(row[0]?.measured_quantity)).toBe(10);
      expect(Number(row[0]?.approved_quantity)).toBe(4);
      expect(Number(row[0]?.approved_quantity)).not.toBe(Number(row[0]?.measured_quantity));
    });
  });

  it('blocks PUBLIC/unauthorized EXECUTE of internal SECURITY DEFINER helper', async () => {
    const { worker, orgId } = await provision();
    await database.asUser(worker.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_progress_line_counts_toward_cumulative(gen_random_uuid(), ${orgId}::uuid)
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks cross-org and wrong-project BOQ node mappings', async () => {
    const { owner, other, orgId, orgBId, projectId, project2Id, projectB } = await provision();
    const { nodeId } = await seedActiveBoq(owner.id, orgId, projectId);
    await seedActiveBoq(other.id, orgBId, projectB);
    const contract2 = await ensureContract(owner.id, orgId, project2Id);

    const draftNodeId = await database.asUser(owner.id, async (tx) => {
      const draft = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 2, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      return insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: draft[0]!.id,
        description: 'Draft map',
        quantity: 1,
        unitPrice: 1,
        amount: 1,
      });
    });

    const fixtures = await database.asService(async (db) => {
      const wpWrongProject = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM work_packages
          WHERE organization_id = ${orgId}::uuid AND project_id = ${project2Id}::uuid
          LIMIT 1
        `),
      );
      const wpForeign = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM work_packages
          WHERE organization_id = ${orgBId}::uuid AND project_id = ${projectB}::uuid
          LIMIT 1
        `),
      );
      const catForeign = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO cost_categories (organization_id, key, name, family)
          VALUES (${orgBId}::uuid, 'foreign', 'Foreign', 'direct_project')
          RETURNING id
        `),
      );
      const budgetWrong = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO project_budgets (organization_id, project_id, name, status, currency)
          VALUES (${orgId}::uuid, ${project2Id}::uuid, 'B2', 'active', 'ILS')
          RETURNING id
        `),
      );
      const blWrong = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO project_budget_lines (
            organization_id, budget_id, label, budget_amount, line_type
          ) VALUES (
            ${orgId}::uuid, ${budgetWrong[0]!.id}::uuid, 'Line', 100, 'total'
          ) RETURNING id
        `),
      );
      const coWrongProject = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${project2Id}::uuid, ${contract2}::uuid, 'addition', 10, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      const existingForeignContract = resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM contracts
          WHERE organization_id = ${orgBId}::uuid AND project_id = ${projectB}::uuid
          LIMIT 1
        `),
      );
      const coForeignId = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgBId}::uuid, ${projectB}::uuid, ${existingForeignContract[0]!.id}::uuid,
            'addition', 10, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      return {
        wpWrongProject: wpWrongProject[0]?.id,
        wpForeign: wpForeign[0]?.id,
        catForeign: catForeign[0]!.id,
        blWrong: blWrong[0]!.id,
        coWrongProject: coWrongProject[0]!.id,
        coForeign: coForeignId[0]!.id,
      };
    });

    await database.asUser(owner.id, async (tx) => {
      if (fixtures.wpForeign) {
        await expect(
          tx.execute(sql`
            SELECT app.boq_mutate_draft_node(
              ${orgId}::uuid, 'update', ${nodeId}::uuid,
              jsonb_build_object('work_package_id', ${fixtures.wpForeign}::uuid)
            )
          `),
        ).rejects.toThrow();
      }
      if (fixtures.wpWrongProject) {
        await expect(
          tx.execute(sql`
            SELECT app.boq_mutate_draft_node(
              ${orgId}::uuid, 'update', ${nodeId}::uuid,
              jsonb_build_object('work_package_id', ${fixtures.wpWrongProject}::uuid)
            )
          `),
        ).rejects.toThrow();
      }
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${nodeId}::uuid,
            jsonb_build_object('cost_category_id', ${fixtures.catForeign}::uuid)
          )
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${nodeId}::uuid,
            jsonb_build_object('budget_line_id', ${fixtures.blWrong}::uuid)
          )
        `),
      ).rejects.toThrow();
    });

    // source_change_order_id is baseline-locked after activate - probe on draft node.
    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${draftNodeId}::uuid,
            jsonb_build_object('source_change_order_id', ${fixtures.coWrongProject}::uuid)
          )
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${draftNodeId}::uuid,
            jsonb_build_object('source_change_order_id', ${fixtures.coForeign}::uuid)
          )
        `),
      ).rejects.toThrow();
    });
  });

  it('rolls back AR create when finalize fails in the same transaction', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const batchId = await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'ATOMIC', 'draft'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid,
          2, 0, 2, 100, 200, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batch[0]!.id}::uuid)`);
      return batch[0]!.id;
    });

    await expect(
      database.asUser(owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: owner.id,
          organizationId: orgId,
          locale: 'en',
        });
        const billing = await createBillingRecordWithPermission(
          context,
          {
            projectId,
            amount: '200',
            currency: 'ILS',
            issueDate: '2026-08-13',
            reference: 'ATOMIC-ORPHAN-TEST',
            finalize: true,
          },
          PERMISSIONS.BOQ_BILLING_CREATE,
        );
        // Force finalize failure (wrong currency) inside same tx as AR create.
        await finalizeProgressBillingRpc(tx, orgId, {
          progressBatchId: batchId,
          billingRecordId: billing.id,
          periodNetAmount: '200',
          currency: 'USD',
        });
      }),
    ).rejects.toThrow();

    await database.asService(async (db) => {
      const ar = resultRows(
        await db.execute(sql`
          SELECT id FROM billing_records
          WHERE organization_id = ${orgId}::uuid AND reference = 'ATOMIC-ORPHAN-TEST'
        `),
      );
      expect(ar.length).toBe(0);
      const batch = resultRows<{ status: string }>(
        await db.execute(sql`SELECT status FROM boq_progress_batches WHERE id = ${batchId}::uuid`),
      );
      expect(batch[0]?.status).toBe('approved');
      const links = resultRows(
        await db.execute(sql`
          SELECT id FROM boq_progress_billing_links WHERE progress_batch_id = ${batchId}::uuid
        `),
      );
      expect(links.length).toBe(0);
    });
  });
});
