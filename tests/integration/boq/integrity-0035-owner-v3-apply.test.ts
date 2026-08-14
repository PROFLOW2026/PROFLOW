import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { assignRole } from '@/modules/rbac';
import {
  organizationMemberships,
  rolePermissions,
  roles,
} from '@drizzle/schema';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';

/**
 * Owner V3 apply blockers: secure-view boq.read + new_item exact reversal.
 */
describe('BOQ owner v3 apply blockers', () => {
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

  async function provisionOwner() {
    const owner = await createTestUser(database, `v3-owner-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'V3 Apply Org');
    const projectId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      const client = await createClient(context, { name: 'Client' });
      const project = await createProject(context, {
        name: 'V3 Project',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });
    return { owner, orgId: org.organization.id, projectId };
  }

  async function seedActiveBoqWithExtras(ownerId: string, orgId: string, projectId: string) {
    return database.asUser(ownerId, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (
            organization_id, project_id, version_number, currency, status, progress_mode
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple'
          ) RETURNING id
        `),
      );
      const node = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_nodes (
            organization_id, boq_id, node_kind, description, pricing_type,
            original_quantity, original_unit_price, original_amount,
            current_quantity, current_unit_price, current_amount
          ) VALUES (
            ${orgId}::uuid, ${boq[0]!.id}::uuid, 'item', 'Base', 'quantity_unit_price',
            10, 100, 1000, 10, 100, 1000
          ) RETURNING id
        `),
      );
      const lump = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_nodes (
            organization_id, boq_id, node_kind, description, pricing_type,
            original_quantity, original_unit_price, original_amount,
            current_quantity, current_unit_price, current_amount
          ) VALUES (
            ${orgId}::uuid, ${boq[0]!.id}::uuid, 'item', 'Lump', 'lump_sum',
            1, 500, 500, 1, 500, 500
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)
      `);
      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, period_label, status, certificate_number
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boq[0]!.id}::uuid, 'P1', 'draft', 1
          ) RETURNING id
        `),
      );
      const pline = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_lines (
            organization_id, batch_id, boq_node_id, measured_quantity, approved_quantity,
            unit_price_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${batch[0]!.id}::uuid, ${node[0]!.id}::uuid, 2, 0, 100, 0, 'ILS'
          ) RETURNING id
        `),
      );
      const contract = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM contracts
          WHERE organization_id = ${orgId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `),
      );
      const co = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 100, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      const alloc = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boq[0]!.id}::uuid, ${co[0]!.id}::uuid,
            'quantity_change', ${node[0]!.id}::uuid, 1, 0, 0, 'seed alloc', NULL
          ) AS id
        `),
      );
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'Sub') RETURNING id
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
            ${orgId}::uuid, ${projectId}::uuid, ${boq[0]!.id}::uuid, ${eng[0]!.id}::uuid, 'ILS', 'draft'
          ) RETURNING id
        `),
      );
      const sline = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_schedule_lines (
            organization_id, schedule_id, boq_node_id, agreed_quantity, unit_rate, amount, currency
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, ${node[0]!.id}::uuid, 2, 50, 100, 'ILS'
          ) RETURNING id
        `),
      );
      const val = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (${orgId}::uuid, ${sched[0]!.id}::uuid, 'V1', 'draft')
          RETURNING id
        `),
      );
      const vline = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuation_lines (
            organization_id, valuation_id, schedule_line_id,
            previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
          ) VALUES (
            ${orgId}::uuid, ${val[0]!.id}::uuid, ${sline[0]!.id}::uuid, 0, 1, 50, 50, 'ILS'
          ) RETURNING id
        `),
      );
      return {
        boqId: boq[0]!.id,
        nodeId: node[0]!.id,
        lumpNodeId: lump[0]!.id,
        progressLineId: pline[0]!.id,
        allocId: alloc[0]!.id,
        scheduleLineId: sline[0]!.id,
        valuationLineId: vline[0]!.id,
      };
    });
  }

  async function createCustomMember(
    orgId: string,
    permissionKeys: readonly string[],
  ) {
    const user = await createTestUser(database, `v3-custom-${Date.now()}@example.test`);
    await database.asService(async (db) => {
      const [role] = await db
        .insert(roles)
        .values({
          organizationId: orgId,
          key: `custom_${Date.now()}`,
          name: 'Custom limited',
          rank: 80,
          isProtected: false,
        })
        .returning({ id: roles.id });
      if (permissionKeys.length > 0) {
        await db.insert(rolePermissions).values(
          permissionKeys.map((permissionKey) => ({
            organizationId: orgId,
            roleId: role!.id,
            permissionKey,
          })),
        );
      }
      const [membership] = await db
        .insert(organizationMemberships)
        .values({
          organizationId: orgId,
          userId: user.id,
          status: 'active',
        })
        .returning({ id: organizationMemberships.id });
      await assignRole(db, {
        organizationId: orgId,
        membershipId: membership!.id,
        userId: user.id,
        roleId: role!.id,
      });
    });
    return user;
  }

  it('blocks secure-view access without boq.read; masks then reveals money', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const seeded = await seedActiveBoqWithExtras(owner.id, orgId, projectId);
    const noRead = await createCustomMember(orgId, ['contracts.read']);
    const readOnly = await createCustomMember(orgId, ['boq.read']);
    const readMoney = await createCustomMember(orgId, ['boq.read', 'contracts.read']);

    await database.asUser(noRead.id, async (tx) => {
      const counts = await Promise.all([
        resultRows(await tx.execute(sql`SELECT id FROM boq_nodes_secure WHERE id = ${seeded.nodeId}::uuid`)),
        resultRows(
          await tx.execute(sql`SELECT id FROM boq_progress_lines_secure WHERE id = ${seeded.progressLineId}::uuid`),
        ),
        resultRows(
          await tx.execute(sql`SELECT id FROM boq_change_allocations_secure WHERE id = ${seeded.allocId}::uuid`),
        ),
        resultRows(
          await tx.execute(
            sql`SELECT id FROM boq_subcontractor_schedule_lines_secure WHERE id = ${seeded.scheduleLineId}::uuid`,
          ),
        ),
        resultRows(
          await tx.execute(
            sql`SELECT id FROM boq_subcontractor_valuation_lines_secure WHERE id = ${seeded.valuationLineId}::uuid`,
          ),
        ),
      ]);
      for (const rows of counts) {
        expect(rows).toHaveLength(0);
      }
    });

    await database.asUser(readOnly.id, async (tx) => {
      const node = resultRows<{ id: string; current_unit_price: string; current_amount: string }>(
        await tx.execute(sql`
          SELECT id, current_unit_price::text, current_amount::text
          FROM boq_nodes_secure WHERE id = ${seeded.nodeId}::uuid
        `),
      );
      expect(node).toHaveLength(1);
      expect(Number(node[0]!.current_unit_price)).toBe(0);
      expect(Number(node[0]!.current_amount)).toBe(0);

      const alloc = resultRows<{ amount_delta: string; unit_price_delta: string }>(
        await tx.execute(sql`
          SELECT amount_delta::text, unit_price_delta::text
          FROM boq_change_allocations_secure WHERE id = ${seeded.allocId}::uuid
        `),
      );
      expect(alloc).toHaveLength(1);
      expect(Number(alloc[0]!.amount_delta)).toBe(0);
      expect(Number(alloc[0]!.unit_price_delta)).toBe(0);

      const sline = resultRows<{ unit_rate: string; amount: string }>(
        await tx.execute(sql`
          SELECT unit_rate::text, amount::text
          FROM boq_subcontractor_schedule_lines_secure WHERE id = ${seeded.scheduleLineId}::uuid
        `),
      );
      expect(Number(sline[0]!.unit_rate)).toBe(0);
      expect(Number(sline[0]!.amount)).toBe(0);

      const vline = resultRows<{ unit_rate_snapshot: string; period_amount: string }>(
        await tx.execute(sql`
          SELECT unit_rate_snapshot::text, period_amount::text
          FROM boq_subcontractor_valuation_lines_secure WHERE id = ${seeded.valuationLineId}::uuid
        `),
      );
      expect(Number(vline[0]!.unit_rate_snapshot)).toBe(0);
      expect(Number(vline[0]!.period_amount)).toBe(0);

      const pline = resultRows<{ unit_price_snapshot: string; period_amount: string }>(
        await tx.execute(sql`
          SELECT unit_price_snapshot::text, period_amount::text
          FROM boq_progress_lines_secure WHERE id = ${seeded.progressLineId}::uuid
        `),
      );
      expect(pline).toHaveLength(1);
      expect(Number(pline[0]!.unit_price_snapshot)).toBe(0);
      expect(Number(pline[0]!.period_amount)).toBe(0);
    });

    await database.asUser(readMoney.id, async (tx) => {
      const node = resultRows<{ current_unit_price: string; current_amount: string }>(
        await tx.execute(sql`
          SELECT current_unit_price::text, current_amount::text
          FROM boq_nodes_secure WHERE id = ${seeded.nodeId}::uuid
        `),
      );
      expect(Number(node[0]!.current_unit_price)).toBe(100);
      expect(Number(node[0]!.current_amount)).toBe(1100);

      const sline = resultRows<{ unit_rate: string; amount: string }>(
        await tx.execute(sql`
          SELECT unit_rate::text, amount::text
          FROM boq_subcontractor_schedule_lines_secure WHERE id = ${seeded.scheduleLineId}::uuid
        `),
      );
      expect(Number(sline[0]!.unit_rate)).toBe(50);
      expect(Number(sline[0]!.amount)).toBe(100);
    });
  });

  it('reverses new_item quantity/unit-price and lump-sum with exact neutralization', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const { boqId, lumpNodeId } = await seedActiveBoqWithExtras(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      const co = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM change_orders WHERE organization_id = ${orgId}::uuid LIMIT 1
        `),
      );
      try {
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${co[0]!.id}::uuid,
            'quantity_change', ${lumpNodeId}::uuid, 1, 0, 0, 'bad qty on lump', NULL
          )
        `);
        expect.fail('quantity_change on lump_sum should fail');
      } catch (error) {
        const nested = error as { cause?: unknown; message?: string };
        const blob = [error, nested.cause, (nested.cause as { message?: string })?.message]
          .map((v) => (v == null ? '' : String(v)))
          .join('\n');
        expect(blob).toMatch(/quantity_change not allowed on lump_sum/i);
      }
    });

    // Fresh transaction after reject (PGlite aborts the prior txn).
    const contract = await database.asUser(owner.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM contracts
          WHERE organization_id = ${orgId}::uuid AND project_id = ${projectId}::uuid
          LIMIT 1
        `),
      ),
    );

    const coQ = await database.asUser(owner.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 500, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      ),
    );
    const coL = await database.asUser(owner.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 1000, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      ),
    );

    const qAlloc = await database.asUser(owner.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${coQ[0]!.id}::uuid,
            'new_item', NULL, 0, 0, 0, 'new qup',
            ${JSON.stringify({
              quantity: 5,
              unit_price: 100,
              pricing_type: 'quantity_unit_price',
              description: 'New QUP',
              item_code: 'N-QUP',
            })}::jsonb
          ) AS id
        `),
      ),
    );

    const qState = await database.asUser(owner.id, async (tx) =>
      resultRows<{
        node_id: string;
        qty: string;
        price: string;
        amount: string;
        orig_amount: string;
        q_delta: string;
        p_delta: string;
        a_delta: string;
      }>(
        await tx.execute(sql`
          SELECT
            n.id AS node_id,
            n.current_quantity::text AS qty,
            n.current_unit_price::text AS price,
            n.current_amount::text AS amount,
            n.original_amount::text AS orig_amount,
            a.quantity_delta::text AS q_delta,
            a.unit_price_delta::text AS p_delta,
            a.amount_delta::text AS a_delta
          FROM boq_change_allocations_secure a
          JOIN boq_nodes_secure n ON n.id = a.boq_node_id
          WHERE a.id = ${qAlloc[0]!.id}::uuid
        `),
      ),
    );
    expect(Number(qState[0]!.qty)).toBe(5);
    expect(Number(qState[0]!.price)).toBe(100);
    expect(Number(qState[0]!.amount)).toBe(500);
    expect(Number(qState[0]!.orig_amount)).toBe(0);
    expect(Number(qState[0]!.q_delta)).toBe(5);
    expect(Number(qState[0]!.p_delta)).toBe(100);
    expect(Number(qState[0]!.a_delta)).toBe(500);

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${qAlloc[0]!.id}::uuid, 'rev qup')
      `);
    });

    const qAfter = await database.asUser(owner.id, async (tx) =>
      resultRows<{ qty: string; price: string; amount: string; net: string }>(
        await tx.execute(sql`
          SELECT
            n.current_quantity::text AS qty,
            n.current_unit_price::text AS price,
            n.current_amount::text AS amount,
            (
              SELECT coalesce(sum(amount_delta), 0)::text
              FROM boq_change_allocations_secure
              WHERE boq_node_id = n.id
            ) AS net
          FROM boq_nodes_secure n
          WHERE n.id = ${qState[0]!.node_id}::uuid
        `),
      ),
    );
    expect(Number(qAfter[0]!.qty)).toBe(0);
    expect(Number(qAfter[0]!.price)).toBe(0);
    expect(Number(qAfter[0]!.amount)).toBe(0);
    expect(Number(qAfter[0]!.net)).toBe(0);

    const lAlloc = await database.asUser(owner.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${coL[0]!.id}::uuid,
            'new_item', NULL, 0, 0, 0, 'new lump',
            ${JSON.stringify({
              quantity: 1,
              unit_price: 1000,
              pricing_type: 'lump_sum',
              description: 'New Lump',
              item_code: 'N-LUMP',
            })}::jsonb
          ) AS id
        `),
      ),
    );

    const later = await database.asUser(owner.id, async (tx) => {
      const node = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT boq_node_id AS id FROM boq_change_allocations_secure WHERE id = ${lAlloc[0]!.id}::uuid
        `),
      );
      const co2 = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contract[0]!.id}::uuid, 'addition', 200, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      const laterAlloc = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${co2[0]!.id}::uuid,
            'unit_price_change', ${node[0]!.id}::uuid, 0, 200, 0, 'later on new lump', NULL
          ) AS id
        `),
      );
      return { nodeId: node[0]!.id, laterId: laterAlloc[0]!.id };
    });

    await database.asUser(owner.id, async (tx) => {
      try {
        await tx.execute(sql`
          SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${lAlloc[0]!.id}::uuid, 'early')
        `);
        expect.fail('new_item reverse with later effective allocation should fail');
      } catch (error) {
        const nested = error as { cause?: { message?: string } };
        const blob = [error, nested.cause, nested.cause?.message]
          .map((v) => (v == null ? '' : String(v)))
          .join('\n');
        expect(blob).toMatch(/later effective allocation/i);
      }
    });

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${later.laterId}::uuid, 'rev later')
      `);
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${lAlloc[0]!.id}::uuid, 'rev lump')
      `);
    });

    const lAfter = await database.asUser(owner.id, async (tx) =>
      resultRows<{ qty: string; price: string; amount: string; orig: string; net: string }>(
        await tx.execute(sql`
          SELECT
            n.current_quantity::text AS qty,
            n.current_unit_price::text AS price,
            n.current_amount::text AS amount,
            n.original_amount::text AS orig,
            (
              SELECT coalesce(sum(amount_delta), 0)::text
              FROM boq_change_allocations_secure
              WHERE boq_node_id = n.id
            ) AS net
          FROM boq_nodes_secure n
          WHERE n.id = ${later.nodeId}::uuid
        `),
      ),
    );
    expect(Number(lAfter[0]!.qty)).toBe(0);
    expect(Number(lAfter[0]!.price)).toBe(0);
    expect(Number(lAfter[0]!.amount)).toBe(0);
    expect(Number(lAfter[0]!.orig)).toBe(0);
    expect(Number(lAfter[0]!.net)).toBe(0);
  });

  it('does not export finalizeBillingRecordCore from billing public barrel', async () => {
    const billing = await import('@/modules/billing');
    expect('finalizeBillingRecordCore' in billing).toBe(false);
    expect(typeof billing.finalizeBillingRecord).toBe('function');
    expect(typeof billing.finalizeBillingRecordWithPermission).toBe('function');
  });
});
