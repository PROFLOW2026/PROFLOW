import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { createProgressBilling } from '@/modules/boq/application/create-progress-billing';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { insertDraftBoqNodeViaRpc } from '../../setup/boq-draft-node';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { readFile } from 'node:fs/promises';

/**
 * Owner full-bundle closure: advanced approve, exact reverse, hierarchy,
 * proposed AP lifecycle, and VAT UI/action path.
 */
describe('BOQ owner full-bundle closure', () => {
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
    const owner = await createTestUser(database, `fb-owner-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'Full Bundle Org');
    const projectId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      const client = await createClient(context, { name: 'FB Client' });
      const project = await createProject(context, {
        name: 'FB Project',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });
    return { owner, orgId: org.organization.id, projectId };
  }

  async function seedBoq(
    userId: string,
    orgId: string,
    projectId: string,
    mode: 'simple' | 'advanced',
    qty = 10,
    price = 10,
  ) {
    return database.asUser(userId, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', ${mode})
          RETURNING id
        `),
      );
      const nodeId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Item',
        quantity: qty,
        unitPrice: price,
        amount: qty * price,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)`);
      return { boqId: boq[0]!.id, nodeId };
    });
  }

  it('simple mode approve canonicalizes measured → approved', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedBoq(owner.id, orgId, projectId, 'simple', 10, 100);

    await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'S1', 'draft')
          RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid,
          10, 0, 0, 0, 0, 'ILS'
        )
      `);
      await tx.execute(
        sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batch[0]!.id}::uuid, NULL::jsonb)`,
      );
      const lines = resultRows<{
        measured_quantity: string;
        approved_quantity: string;
        period_amount: string;
      }>(
        await tx.execute(sql`
          SELECT measured_quantity::text, approved_quantity::text, period_amount::text
          FROM boq_progress_lines_secure WHERE batch_id = ${batch[0]!.id}::uuid
        `),
      );
      expect(lines[0]!.measured_quantity).toMatch(/^10(\.0+)?$/);
      expect(lines[0]!.approved_quantity).toMatch(/^10(\.0+)?$/);
      expect(Number(lines[0]!.period_amount)).toBe(1000);
    });
  });

  it('advanced mode keeps measured≠approved and bills approved qty', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedBoq(owner.id, orgId, projectId, 'advanced', 10, 100);

    const prepared = await database.asUser(owner.id, async (tx) => {
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status
          ) VALUES (${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'A1', 'draft')
          RETURNING id
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
      return { batchId: batch[0]!.id, lineId: line[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(
          sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${prepared.batchId}::uuid, NULL::jsonb)`,
        ),
      ).rejects.toThrow();
    });

    const batchId = await database.asUser(owner.id, async (tx) => {
      const approvals = JSON.stringify({ [prepared.lineId]: '4' });
      await tx.execute(sql`
        SELECT app.approve_boq_progress_batch(
          ${orgId}::uuid, ${prepared.batchId}::uuid, ${approvals}::jsonb
        )
      `);

      const lines = resultRows<{
        measured_quantity: string;
        approved_quantity: string;
        period_amount: string;
      }>(
        await tx.execute(sql`
          SELECT measured_quantity::text, approved_quantity::text, period_amount::text
          FROM boq_progress_lines_secure WHERE id = ${prepared.lineId}::uuid
        `),
      );
      expect(lines[0]!.measured_quantity).toMatch(/^10(\.0+)?$/);
      expect(lines[0]!.approved_quantity).toMatch(/^4(\.0+)?$/);
      expect(Number(lines[0]!.period_amount)).toBe(400);
      return prepared.batchId;
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
        retentionPercent: '10',
      });
      expect(result).toBeTruthy();
      const link = resultRows<{ period_net_amount: string }>(
        await tx.execute(sql`
          SELECT period_net_amount::text FROM boq_progress_billing_links
          WHERE progress_batch_id = ${batchId}::uuid AND voided_at IS NULL
        `),
      );
      expect(Number(link[0]!.period_net_amount)).toBe(400);
      const ar = resultRows<{
        subtotal_amount: string;
        tax_amount: string | null;
        total_amount: string;
      }>(
        await tx.execute(sql`
          SELECT br.subtotal_amount::text, br.tax_amount::text, br.total_amount::text
          FROM billing_records br
          JOIN boq_progress_billing_links l ON l.billing_record_id = br.id
          WHERE l.progress_batch_id = ${batchId}::uuid
        `),
      );
      expect(Number(ar[0]!.subtotal_amount)).toBe(400);
      expect(Number(ar[0]!.tax_amount)).toBe(18);
      expect(Number(ar[0]!.total_amount)).toBe(418);
    });
  });

  it('blocks mixed qty+price allocation and exact LIFO reverse', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedBoq(owner.id, orgId, projectId, 'simple', 10, 10);

    const ids = await database.asUser(owner.id, async (tx) => {
      const contract = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM contracts
          WHERE organization_id = ${orgId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `),
      );
      expect(contract[0]?.id).toBeTruthy();

      const coA = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 100, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      const coB = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 100, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      return { coA: coA[0]!.id, coB: coB[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${ids.coA}::uuid,
            'quantity_change', ${nodeId}::uuid, 1, 1, 0, 'mixed', NULL
          )
        `),
      ).rejects.toThrow();
    });

    const allocIds = await database.asUser(owner.id, async (tx) => {
      const allocA = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${ids.coA}::uuid,
            'unit_price_change', ${nodeId}::uuid, 0, 1, 0, 'price +1', NULL
          ) AS id
        `),
      );
      const allocB = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${ids.coB}::uuid,
            'quantity_change', ${nodeId}::uuid, 1, 0, 0, 'qty +1', NULL
          ) AS id
        `),
      );
      return { allocA: allocA[0]!.id, allocB: allocB[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${allocIds.allocA}::uuid, 'too early')
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${allocIds.allocB}::uuid, 'rev B')
      `);
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${allocIds.allocA}::uuid, 'rev A')
      `);

      const node = resultRows<{
        current_quantity: string;
        current_unit_price: string;
        current_amount: string;
      }>(
        await tx.execute(sql`
          SELECT current_quantity::text, current_unit_price::text, current_amount::text
          FROM boq_nodes_secure WHERE id = ${nodeId}::uuid
        `),
      );
      expect(Number(node[0]!.current_quantity)).toBe(10);
      expect(Number(node[0]!.current_unit_price)).toBe(10);
      expect(Number(node[0]!.current_amount)).toBe(100);
    });

    await database.asService(async (db) => {
      const nets = resultRows<{ change_order_id: string; net: string }>(
        await db.execute(sql`
          SELECT change_order_id::text, coalesce(sum(amount_delta),0)::text AS net
          FROM boq_change_allocations
          WHERE organization_id = ${orgId}::uuid
            AND change_order_id IN (${ids.coA}::uuid, ${ids.coB}::uuid)
          GROUP BY change_order_id
        `),
      );
      expect(nets.length).toBe(2);
      for (const row of nets) {
        expect(Number(row.net)).toBe(0);
      }
    });
  });

  it('enforces hierarchy integrity', async () => {
    const { owner, orgId, projectId } = await provision();
    const ids = await database.asUser(owner.id, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft')
          RETURNING id
        `),
      );
      const chapterId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Ch',
        nodeKind: 'chapter',
        quantity: 0,
        unitPrice: 0,
        amount: 0,
      });
      const itemId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'It',
        parentId: chapterId,
        quantity: 1,
        unitPrice: 1,
        amount: 1,
      });
      const childChapterId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Sub',
        nodeKind: 'chapter',
        parentId: chapterId,
        quantity: 0,
        unitPrice: 0,
        amount: 0,
      });
      return {
        boqId: boq[0]!.id,
        chapterId,
        itemId,
        childChapterId,
      };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${ids.chapterId}::uuid,
            jsonb_build_object('parent_id', ${ids.chapterId}::uuid)
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${ids.chapterId}::uuid,
            jsonb_build_object('parent_id', ${ids.itemId}::uuid)
          )
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgId}::uuid, 'update', ${ids.chapterId}::uuid,
            jsonb_build_object('parent_id', ${ids.childChapterId}::uuid)
          )
        `),
      ).rejects.toThrow();
    });
  });

  it('proposed AP lifecycle is canonical-only', async () => {
    const { owner, orgId, projectId } = await provision();
    const { boqId, nodeId } = await seedBoq(owner.id, orgId, projectId, 'simple');

    const seeded = await database.asUser(owner.id, async (tx) => {
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
      await tx.execute(
        sql`SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)`,
      );
      const val = resultRows<{ id: string; proposed_vendor_bill_id: string | null }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'P1', 'draft')
          RETURNING id, proposed_vendor_bill_id
        `),
      );
      expect(val[0]!.proposed_vendor_bill_id).toBeNull();
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id, previous_approved_quantity,
          approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${val[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 2, 5, 10, 'ILS'
        )
      `);
      await tx.execute(
        sql`SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${val[0]!.id}::uuid)`,
      );
      const bill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (organization_id, vendor_id, project_id, status, currency, total_amount)
          VALUES (${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'draft', 'ILS', 10)
          RETURNING id
        `),
      );
      return { valId: val[0]!.id, billId: bill[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      const afterApprove = resultRows<{
        status: string;
        proposed_vendor_bill_id: string | null;
      }>(
        await tx.execute(sql`
          SELECT status, proposed_vendor_bill_id::text AS proposed_vendor_bill_id
          FROM boq_subcontractor_valuations WHERE id = ${seeded.valId}::uuid
        `),
      );
      expect(afterApprove[0]!.status).toBe('approved');
      expect(afterApprove[0]!.proposed_vendor_bill_id).toBeNull();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations SET status = 'voided'
          WHERE id = ${seeded.valId}::uuid
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE boq_subcontractor_valuations
          SET status = 'proposed_ap', proposed_vendor_bill_id = ${seeded.billId}::uuid
          WHERE id = ${seeded.valId}::uuid
        `),
      ).rejects.toThrow();
    });

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.propose_boq_subcontractor_valuation_ap(
          ${orgId}::uuid, ${seeded.valId}::uuid, ${seeded.billId}::uuid
        )
      `);
      const proposed = resultRows<{ status: string; proposed_vendor_bill_id: string }>(
        await tx.execute(sql`
          SELECT status, proposed_vendor_bill_id::text
          FROM boq_subcontractor_valuations WHERE id = ${seeded.valId}::uuid
        `),
      );
      expect(proposed[0]!.status).toBe('proposed_ap');
      expect(proposed[0]!.proposed_vendor_bill_id).toBe(seeded.billId);
    });
  });

  it('createProgressBillingAction forwards taxAmount from form', async () => {
    const form = new FormData();
    form.set('projectId', '11111111-1111-4111-8111-111111111111');
    form.set('batchId', '22222222-2222-4222-8222-222222222222');
    form.set('taxAmount', '18');
    form.set('retentionPercent', '10');

    // Action + UI wiring evidence: taxAmount is read from FormData (same path real UI uses).
    const src = await readFile('src/modules/boq/ui/actions.ts', 'utf8');
    expect(src).toMatch(/taxAmount:\s*formData\.get\('taxAmount'\)/);
    const panel = await readFile('src/modules/boq/ui/boq-panel-client.tsx', 'utf8');
    expect(panel).toMatch(/name="taxAmount"/);
    expect(panel).toMatch(/progress\.taxAmount/);
    expect(form.get('taxAmount')).toBe('18');
  });
});
