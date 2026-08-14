import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { organizationMemberships } from '@drizzle/schema';
import { createBillingRecordWithPermission } from '@/modules/billing';
import { createProgressBilling } from '@/modules/boq/application/create-progress-billing';
import { finalizeProgressBillingRpc } from '@/modules/boq/data/boq.repository';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { insertDraftBoqNodeViaRpc } from '../../setup/boq-draft-node';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

/**
 * Final adversarial pattern sweep (0035 Â§13).
 * Covers reparent bypasses, AR net/VAT/retention, draft/void AR, sub cumulative,
 * approval evidence forgery, mapping lock.
 */
describe('BOQ final pattern-sweep adversarial', () => {
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
    const owner = await createTestUser(database, `ps-owner-${Date.now()}@example.test`);
    const worker = await createTestUser(database, `ps-worker-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'Pattern Sweep Org');

    const projectId = await database.asUser(owner.id, async (tx) => {
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
      const client = await createClient(context, { name: 'PS Client' });
      const project = await createProject(context, {
        name: 'PS Project',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });

    return { owner, worker, orgId: org.organization.id, projectId };
  }

  async function seedActiveBoq(userId: string, orgId: string, projectId: string) {
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

  it('blocks active schedule line reparent to draft schedule', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'V') RETURNING id
        `),
      );
      const eng = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendor_engagements (organization_id, vendor_id, project_id, status)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'active')
          RETURNING id
        `),
      );
      const a = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const b = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedules (
            organization_id, project_id, boq_id, vendor_engagement_id, currency, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${a[0]!.id}::uuid, ${nodeId}::uuid, 10, 5, 50, 'ILS')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${a[0]!.id}::uuid)
      `);
      return { lineId: line[0]!.id, draftB: b[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_schedule_lines
          SET schedule_id = ${ids.draftB}::uuid
          WHERE id = ${ids.lineId}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks approved valuation line reparent to draft valuation', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'V2') RETURNING id
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
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 10, 5, 50, 'ILS')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)
      `);
      const va = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'A', 'draft') RETURNING id
        `),
      );
      const vb = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'B', 'draft') RETURNING id
        `),
      );
      const vline = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuation_lines (
            organization_id, valuation_id, schedule_line_id,
            previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${va[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 4, 5, 20, 'ILS'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${va[0]!.id}::uuid)
      `);
      return { vlineId: vline[0]!.id, draftB: vb[0]!.id, valA: va[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuation_lines
          SET valuation_id = ${ids.draftB}::uuid
          WHERE id = ${ids.vlineId}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations
          SET approved_at = now() - interval '1 day'
          WHERE id = ${ids.valA}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations
          SET approved_by_user_id = ${owner.id}::uuid
          WHERE id = ${ids.valA}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks schedule/line currency mismatch and negative qty/rate', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'V3') RETURNING id
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
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const line = resultRows<{ id: string; currency: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 2, 10, 20, 'USD')
          RETURNING id, currency
        `),
      );
      expect(line[0]!.currency).toBe('ILS');
      await expect(
        tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, -1, 10, -10, 'ILS')
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 1, -10, -10, 'ILS')
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks subcontractor cumulative over-valuation and client previous forgery', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'V4') RETURNING id
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
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 10, 5, 50, 'ILS')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)
      `);

      const v1 = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P1', 'draft') RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id,
          previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (${orgId}::uuid, ${v1[0]!.id}::uuid, ${line[0]!.id}::uuid, 999, 6, 1, 1, 'USD')
      `);
      await tx.execute(sql`
        SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${v1[0]!.id}::uuid)
      `);
      const stamped = resultRows<{ previous_approved_quantity: string; unit_rate_snapshot: string }>(
        await tx.execute(sql`
          SELECT previous_approved_quantity::text, unit_rate_snapshot::text
          FROM boq_subcontractor_valuation_lines_secure
          WHERE valuation_id = ${v1[0]!.id}::uuid
        `),
      );
      expect(Number(stamped[0]!.previous_approved_quantity)).toBe(0);
      expect(Number(stamped[0]!.unit_rate_snapshot)).toBe(5);

      const v2ok = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P2', 'draft') RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id,
          previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (${orgId}::uuid, ${v2ok[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 4, 5, 20, 'ILS')
      `);
      await tx.execute(sql`
        SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${v2ok[0]!.id}::uuid)
      `);

      const v3 = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P3', 'draft') RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id,
          previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (${orgId}::uuid, ${v3[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 5, 5, 25, 'ILS')
      `);
      await expect(
        tx.execute(sql`
          SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${v3[0]!.id}::uuid)
        `),
      ).rejects.toThrow();
    });
  });

  it('BOQ net equals AR subtotal with VAT+retention; draft/void/wrong-kind blocked', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const batchId = await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'VAT', 'draft')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 1, 0, 1, 100, 100, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batch[0]!.id}::uuid)`);
      return batch[0]!.id;
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const result = await createProgressBilling(context, {
        batchId,
        taxAmount: '18',
        retentionAmount: '10',
      });
      expect(result.billing.id).toBeTruthy();
    });

    await database.asService(async (db) => {
      const link = resultRows<{
        period_net_amount: string;
        subtotal: string;
        tax: string;
        total: string;
        retention: string;
      }>(
        await db.execute(sql`
          SELECT l.period_net_amount::text, b.subtotal_amount::text AS subtotal,
                 coalesce(b.tax_amount::text, '0') AS tax, b.total_amount::text AS total,
                 b.retention_amount::text AS retention
          FROM boq_progress_billing_links l
          JOIN billing_records b ON b.id = l.billing_record_id
          WHERE l.progress_batch_id = ${batchId}::uuid
        `),
      );
      expect(Number(link[0]!.period_net_amount)).toBe(100);
      expect(Number(link[0]!.subtotal)).toBe(100);
      expect(Number(link[0]!.tax)).toBe(18);
      expect(Number(link[0]!.total)).toBe(118);
      expect(Number(link[0]!.retention)).toBe(10);
      expect(Number(link[0]!.period_net_amount)).not.toBe(118);
    });

    // Separate batch for draft/void/kind attacks
    const batch2 = await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 2, 'BAD', 'draft')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 1, 0, 1, 50, 50, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batch[0]!.id}::uuid)`);
      return batch[0]!.id;
    });

    const bills = await database.asService(async (db) => {
      const draft = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, kind, status, issue_date,
            subtotal_amount, tax_amount, total_amount, currency, retention_amount, retention_held_remaining
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, 'invoice', 'draft', CURRENT_DATE,
            50, 0, 50, 'ILS', 0, 0
          ) RETURNING id
        `),
      );
      const voided = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, kind, status, issue_date,
            subtotal_amount, tax_amount, total_amount, currency, retention_amount, retention_held_remaining,
            voided_at
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, 'invoice', 'void', CURRENT_DATE,
            50, 0, 50, 'ILS', 0, 0, now()
          ) RETURNING id
        `),
      );
      const credit = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO billing_records (
            organization_id, project_id, kind, status, issue_date,
            subtotal_amount, tax_amount, total_amount, currency, retention_amount, retention_held_remaining
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, 'credit_note', 'finalized', CURRENT_DATE,
            50, 0, 50, 'ILS', 0, 0
          ) RETURNING id
        `),
      );
      return { draft: draft[0]!.id, voided: voided[0]!.id, credit: credit[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.finalize_boq_progress_billing(
            ${orgId}::uuid, ${batch2}::uuid, ${bills.draft}::uuid, 50, 'ILS'
          )
        `),
      ).rejects.toThrow();
    });
    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.finalize_boq_progress_billing(
            ${orgId}::uuid, ${batch2}::uuid, ${bills.voided}::uuid, 50, 'ILS'
          )
        `),
      ).rejects.toThrow();
    });
    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.finalize_boq_progress_billing(
            ${orgId}::uuid, ${batch2}::uuid, ${bills.credit}::uuid, 50, 'ILS'
          )
        `),
      ).rejects.toThrow();
    });
  });

  it('blocks post-activation mapping updates and progress line reparent from approved batch', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const wp = await database.asService(async (db) =>
      resultRows<{ id: string }>(
        await db.execute(sql`
          SELECT id FROM work_packages
          WHERE organization_id = ${orgId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `),
      ),
    );

    await database.asUser(owner.id, async (tx) => {
      if (wp[0]?.id) {
        await expect(
          tx.execute(sql`
            SELECT app.boq_mutate_draft_node(
              ${orgId}::uuid, 'update', ${nodeId}::uuid,
              jsonb_build_object('work_package_id', ${wp[0]!.id}::uuid)
            )
          `),
        ).rejects.toThrow();
      }
    });

    const ids = await database.asUser(owner.id, async (tx) => {
      const approvedBatch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 9, 'R', 'draft')
          RETURNING id
        `),
      );
      const line = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_lines (
            organization_id, batch_id, boq_node_id, measured_quantity,
            previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${approvedBatch[0]!.id}::uuid, ${nodeId}::uuid, 1, 0, 0, 0, 0, 'ILS'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${approvedBatch[0]!.id}::uuid)
      `);
      const draftBatch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 10, 'D', 'draft')
          RETURNING id
        `),
      );
      return { lineId: line[0]!.id, draftBatchId: draftBatch[0]!.id };
    });

    // Bypass RLS â€” prove trigger blocks reparent from approvedâ†’draft batch.
    await database.asService(async (db) => {
      await expect(
        db.execute(sql`
          UPDATE boq_progress_lines
          SET batch_id = ${ids.draftBatchId}::uuid
          WHERE id = ${ids.lineId}::uuid
        `),
      ).rejects.toThrow();
    });
  });

  it('AR create + finalize same-transaction rollback with VAT+retention path evidence', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const batchId = await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'ATOMIC2', 'draft')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 1, 0, 1, 100, 100, 'ILS'
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
        // Evidence path: createProgressBilling.ts â€” createBillingRecordWithPermission +
        // finalizeProgressBillingRpc on context.db inside withUserContext transaction.
        const billing = await createBillingRecordWithPermission(
          context,
          {
            projectId,
            amount: '100',
            netAmount: '100',
            taxAmount: '18',
            currency: 'ILS',
            issueDate: '2026-08-13',
            reference: 'ATOMIC-VAT-ORPHAN',
            retentionAmount: '5',
            finalize: true,
          },
          PERMISSIONS.BOQ_BILLING_CREATE,
        );
        await finalizeProgressBillingRpc(tx, orgId, {
          progressBatchId: batchId,
          billingRecordId: billing.id,
          periodNetAmount: '100',
          currency: 'USD',
        });
      }),
    ).rejects.toThrow();

    await database.asService(async (db) => {
      const ar = resultRows(
        await db.execute(sql`
          SELECT id FROM billing_records
          WHERE organization_id = ${orgId}::uuid AND reference = 'ATOMIC-VAT-ORPHAN'
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

  it('blocks draft approved_at/by forgery and direct draftâ†’approved without RPC', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId } = await seedActiveBoq(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'V5') RETURNING id
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
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft')
          RETURNING id
        `),
      );
      // Keep schedule draft — this test only forges valuation approval evidence.
      const val = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (organization_id, schedule_id, period_label, status)
          VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'F', 'draft') RETURNING id
        `),
      );
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations
          SET approved_at = now(), approved_by_user_id = ${owner.id}::uuid
          WHERE id = ${val[0]!.id}::uuid
        `),
      ).rejects.toThrow();
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations SET status = 'approved' WHERE id = ${val[0]!.id}::uuid
        `),
      ).rejects.toThrow();
    });
  });
});
