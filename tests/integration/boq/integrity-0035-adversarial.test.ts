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

/**
 * Adversarial SQL/RLS tests for BOQ integrity closure (0035).
 * Runs as authenticated users - same path as production PostgREST-style access.
 */
describe('BOQ integrity closure adversarial RLS', () => {
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

  async function provisionBoqTenant() {
    const owner = await createTestUser(database, `boq-owner-${Date.now()}@example.test`);
    const worker = await createTestUser(database, `boq-worker-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'BOQ Integrity Co');

    await database.asUser(owner.id, async (tx) => {
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

      const client = await createClient(context, { name: 'Client' });
      const project = await createProject(context, {
        name: 'BOQ Project',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });

    const projectId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Client 2' });
      const project = await createProject(context, {
        name: 'BOQ Project 2',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return project.projectId;
    });

    return { owner, worker, orgId: org.organization.id, projectId };
  }

  it('clean-starts through 0035 with activate RPC and secure view present', async () => {
    const fns = await database.asService(async (db) =>
      resultRows<{ proname: string }>(
        await db.execute(sql`
          SELECT p.proname
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app'
            AND p.proname IN (
              'activate_project_boq',
              'boq_allocate_change',
              'approve_boq_progress_batch',
              'insert_boq_progress_billing_link',
              'supersede_boq_progress_batch',
              'boq_reverse_change_allocation'
            )
          ORDER BY p.proname
        `),
      ),
    );
    expect(fns.map((r) => r.proname)).toEqual([
      'activate_project_boq',
      'approve_boq_progress_batch',
      'boq_allocate_change',
      'boq_reverse_change_allocation',
      'insert_boq_progress_billing_link',
      'supersede_boq_progress_batch',
    ]);

    const view = await database.asService(async (db) =>
      resultRows(
        await db.execute(sql`
          SELECT 1 FROM information_schema.views
          WHERE table_schema = 'public' AND table_name = 'boq_nodes_secure'
        `),
      ),
    );
    expect(view.length).toBe(1);
  });

  it('blocks active→draft and direct current_* rewrite after activation', async () => {
    const { owner, orgId, projectId } = await provisionBoqTenant();

    const ids = await database.asUser(owner.id, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      const boqId = boq[0]!.id;
      const nodeId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId,
        description: 'Point',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boqId}::uuid)`);
      return { boqId, nodeId };
    });

    await database.asUser(owner.id, async (tx) => {
      await expect(
        tx.execute(sql`
          UPDATE project_boqs SET status = 'draft'
          WHERE id = ${ids.boqId}::uuid AND organization_id = ${orgId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          SELECT set_config('app.boq_allocation_write', 'on', true);
          UPDATE boq_nodes SET current_quantity = 999
          WHERE id = ${ids.nodeId}::uuid AND organization_id = ${orgId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 99, 'ILS', 'active', 'simple')
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          UPDATE boq_nodes SET current_quantity = 999
          WHERE id = ${ids.nodeId}::uuid AND organization_id = ${orgId}::uuid
        `),
      ).rejects.toThrow();

      await expect(
        tx.execute(sql`
          INSERT INTO boq_nodes (
            organization_id, boq_id, node_kind, description, pricing_type,
            original_quantity, original_unit_price, original_amount,
            current_quantity, current_unit_price, current_amount
          ) VALUES (
            ${orgId}::uuid, ${ids.boqId}::uuid, 'item', 'Illegal', 'quantity_unit_price',
            1, 1, 1, 1, 1, 1
          )
        `),
      ).rejects.toThrow();
    });
  });

  it('forces progress batch insert to draft and blocks hard-delete of approved', async () => {
    const { owner, orgId, projectId } = await provisionBoqTenant();

    const batchId = await database.asUser(owner.id, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      const boqId = boq[0]!.id;
      const nodeId = await insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId,
        description: 'Point',
        quantity: 10,
        unitPrice: 100,
        amount: 1000,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boqId}::uuid)`);

      const node = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM boq_nodes_secure WHERE boq_id = ${boqId}::uuid LIMIT 1
        `),
      );
      expect(node[0]!.id).toBe(nodeId);

      const inserted = resultRows<{ id: string; status: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, certificate_number, period_label, status, approved_at
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 1, 'Aug', 'approved', now()
          ) RETURNING id, status
        `),
      );
      expect(inserted[0]!.status).toBe('draft');

      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity,
          previous_approved_quantity, approved_quantity, unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${inserted[0]!.id}::uuid, ${node[0]!.id}::uuid, 1,
          0, 0, 0, 0, 'ILS'
        )
      `);
      await tx.execute(sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${inserted[0]!.id}::uuid)`);
      return inserted[0]!.id;
    });

    await database.asUser(owner.id, async (tx) => {
      await tx.execute(sql`
        DELETE FROM boq_progress_batches WHERE id = ${batchId}::uuid
      `);
      const still = resultRows(
        await tx.execute(sql`
          SELECT status FROM boq_progress_batches WHERE id = ${batchId}::uuid
        `),
      );
      expect(still.length).toBe(1);
      expect((still[0] as { status: string }).status).toBe('approved');
    });
  });

  it('masks unit prices for worker on boq_nodes_secure', async () => {
    const { owner, worker, orgId, projectId } = await provisionBoqTenant();

    const nodeId = await database.asUser(owner.id, async (tx) => {
      const boq = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO project_boqs (organization_id, project_id, version_number, currency, status, progress_mode)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple')
          RETURNING id
        `),
      );
      return insertDraftBoqNodeViaRpc(tx, {
        organizationId: orgId,
        boqId: boq[0]!.id,
        description: 'Point',
        quantity: 10,
        unitPrice: 321.5,
        amount: 3215,
      });
    });

    const workerRow = await database.asUser(worker.id, async (tx) =>
      resultRows<{ current_unit_price: string; current_amount: string }>(
        await tx.execute(sql`
          SELECT current_unit_price::text, current_amount::text
          FROM boq_nodes_secure
          WHERE id = ${nodeId}::uuid
        `),
      ),
    );
    expect(Number(workerRow[0]?.current_unit_price ?? '1')).toBe(0);
    expect(Number(workerRow[0]?.current_amount ?? '1')).toBe(0);

    await database.asUser(worker.id, async (tx) => {
      await expect(
        tx.execute(sql`
          SELECT current_unit_price, current_amount
          FROM boq_nodes
          WHERE id = ${nodeId}::uuid
        `),
      ).rejects.toThrow();
    });

    const ownerRow = await database.asUser(owner.id, async (tx) =>
      resultRows<{ current_unit_price: string }>(
        await tx.execute(sql`
          SELECT current_unit_price::text
          FROM boq_nodes_secure
          WHERE id = ${nodeId}::uuid
        `),
      ),
    );
    expect(Number(ownerRow[0]?.current_unit_price)).toBeCloseTo(321.5);
  });
});
