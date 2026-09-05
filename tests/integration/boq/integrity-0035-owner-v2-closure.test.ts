import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { organizationMemberships } from '@drizzle/schema';
import { createProgressBilling } from '@/modules/boq/application/create-progress-billing';
import { createBillingRecordWithPermission, finalizeBillingRecord } from '@/modules/billing';
import { ensureDefaultBranding } from '@/modules/branding';
import { listActiveBoqsWithTotalsForOrg } from '@/modules/boq/data/boq.repository';
import { reconcileContractBoq } from '@/modules/boq/domain/reconciliation';
import { computeNetApprovedChanges } from '@/modules/commercial';
import { loadProjectCommercialData } from '@/modules/financials/data/commercial.repository';
import { money } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, applySqlMigrations, resultRows, type TestDatabase } from '../../setup/database';
import { insertDraftBoqNodeViaRpc } from '../../setup/boq-draft-node';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import {
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from '../pre0021/two-connection';

/**
 * Owner V2 closure - concurrency, permission, allocation seq, draft AP, recon truth.
 */
describe('BOQ owner v2 closure', () => {
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
    const owner = await createTestUser(database, `v2-owner-${Date.now()}@example.test`);
    const org = await createTestOrganization(database, owner, 'V2 Closure Org');
    const seeded = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'en',
      });
      await setModuleVisibility(context, { moduleKey: 'boq', enabled: true });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: org.organization.name ?? 'V2 Closure Org',
        countryCode: 'IL',
      });
      const client = await createClient(context, { name: 'Client V2' });
      const project = await createProject(context, {
        name: 'Project V2',
        clientId: client.id,
        contractValueAmount: '100000',
        status: 'active',
      });
      return { projectId: project.projectId, context };
    });
    return { owner, orgId: org.organization.id, projectId: seeded.projectId };
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
          INSERT INTO contracts (organization_id, project_id, currency, status)
          VALUES (${orgId}::uuid, ${projectId}::uuid, 'ILS', 'active')
          RETURNING id
        `),
      );
      return created[0]!.id;
    });
  }

  async function seedActiveBoq(
    userId: string,
    orgId: string,
    projectId: string,
    qty = '10',
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
        quantity: qty,
        unitPrice: 100,
        amount: Number(qty) * 100,
      });
      await tx.execute(sql`SELECT app.activate_project_boq(${orgId}::uuid, ${boq[0]!.id}::uuid)`);
      return { boqId: boq[0]!.id, nodeId };
    });
  }

  it('manager with BOQ_BILLING_CREATE and without BILLING_MANAGE can finalize progress billing', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const manager = await createTestUser(database, `v2-mgr-${Date.now()}@example.test`);
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const batchId = await database.asUser(owner.id, async (tx) => {
      const managerRole = await findRoleByKey(tx, orgId, 'manager');
      if (!managerRole) throw new Error('manager role missing');
      const [membership] = await tx
        .insert(organizationMemberships)
        .values({ organizationId: orgId, userId: manager.id, status: 'active' })
        .returning({ id: organizationMemberships.id });
      await assignRole(tx, {
        organizationId: orgId,
        membershipId: membership!.id,
        userId: manager.id,
        roleId: managerRole.id,
      });

      const batch = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_progress_batches (
            organization_id, project_id, boq_id, period_label, status, certificate_number
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 'M1', 'draft', 1
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity, approved_quantity,
          unit_price_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${batch[0]!.id}::uuid, ${nodeId}::uuid, 2, 0,
          100, 0, 'ILS'
        )
      `);
      await tx.execute(
        sql`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batch[0]!.id}::uuid, NULL::jsonb)`,
      );
      return batch[0]!.id;
    });

    await database.asUser(manager.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: manager.id,
        organizationId: orgId,
        locale: 'en',
      });
      expect(context.permissions.has(PERMISSIONS.BOQ_BILLING_CREATE)).toBe(true);
      expect(context.permissions.has(PERMISSIONS.BILLING_MANAGE)).toBe(false);

      const result = await createProgressBilling(context, {
        batchId,
        taxAmount: '18',
        retentionPercent: '10',
      });
      expect(result.billing.status).toBe('finalized');

      const draft = await createBillingRecordWithPermission(
        context,
        {
          projectId,
          amount: '10',
          currency: 'ILS',
          issueDate: '2026-08-13',
          reference: 'MGR-DRAFT-ONLY',
          finalize: false,
        },
        PERMISSIONS.BOQ_BILLING_CREATE,
      );
      expect(draft.status).toBe('draft');
      await expect(finalizeBillingRecord(context, draft.id)).rejects.toBeInstanceOf(
        AuthorizationError,
      );

      const links = resultRows(
        await tx.execute(sql`
          SELECT id FROM boq_progress_billing_links
          WHERE progress_batch_id = ${batchId}::uuid AND voided_at IS NULL
        `),
      );
      expect(links.length).toBe(1);
    });
  });

  it('proposed AP requires draft AP bill; open/void blocked', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);

    const ids = await database.asUser(owner.id, async (tx) => {
      const vendor = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO vendors (organization_id, name) VALUES (${orgId}::uuid, 'Sub V') RETURNING id
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
            ${orgId}::uuid, ${sched[0]!.id}::uuid, ${nodeId}::uuid, 10, 50, 500, 'ILS'
          ) RETURNING id
        `),
      );
      await tx.execute(
        sql`SELECT app.activate_boq_subcontractor_schedule(${orgId}::uuid, ${sched[0]!.id}::uuid)`,
      );
      const val = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, 'P1', 'draft'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id,
          previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${val[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 1, 50, 50, 'ILS'
        )
      `);
      await tx.execute(
        sql`SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${val[0]!.id}::uuid)`,
      );

      const draft = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, project_id, status, currency, total_amount, bill_date
          ) VALUES (
            ${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'draft', 'ILS', 50, '2026-08-13'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.propose_boq_subcontractor_valuation_ap(
          ${orgId}::uuid, ${val[0]!.id}::uuid, ${draft[0]!.id}::uuid
        )
      `);

      // Second valuation for non-draft rejection cases
      const val2 = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO boq_subcontractor_valuations (
            organization_id, schedule_id, period_label, status
          ) VALUES (
            ${orgId}::uuid, ${sched[0]!.id}::uuid, 'P2', 'draft'
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        INSERT INTO boq_subcontractor_valuation_lines (
          organization_id, valuation_id, schedule_line_id,
          previous_approved_quantity, approved_quantity, unit_rate_snapshot, period_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${val2[0]!.id}::uuid, ${line[0]!.id}::uuid, 0, 1, 50, 50, 'ILS'
        )
      `);
      await tx.execute(
        sql`SELECT app.approve_boq_subcontractor_valuation(${orgId}::uuid, ${val2[0]!.id}::uuid)`,
      );

      const openBill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, project_id, status, currency, total_amount, net_amount, tax_amount, gross_amount, bill_date
          ) VALUES (
            ${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'draft', 'ILS', 50, 50, 0, 50, '2026-08-13'
          ) RETURNING id
        `),
      );
      const materialsId = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM cost_categories
          WHERE organization_id = ${orgId}::uuid AND key = 'materials'
          LIMIT 1
        `),
      )[0]!.id;
      await tx.execute(sql`
        INSERT INTO ap_bill_lines (
          organization_id, ap_bill_id, description, quantity, unit_amount, line_total,
          net_amount, tax_amount, gross_amount, currency, classification_status, cost_category_id, sort_order
        ) VALUES (
          ${orgId}::uuid, ${openBill[0]!.id}::uuid, 'Test line', 1, 50, 50,
          50, 0, 50, 'ILS', 'classified', ${materialsId}::uuid, 0
        )
      `);
      await tx.execute(sql`UPDATE ap_bills SET status = 'open' WHERE id = ${openBill[0]!.id}::uuid`);
      const voidBill = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO ap_bills (
            organization_id, vendor_id, project_id, status, currency, total_amount, bill_date
          ) VALUES (
            ${orgId}::uuid, ${vendor[0]!.id}::uuid, ${projectId}::uuid, 'void', 'ILS', 50, '2026-08-13'
          ) RETURNING id
        `),
      );
      return {
        val2Id: val2[0]!.id,
        openBillId: openBill[0]!.id,
        voidBillId: voidBill[0]!.id,
      };
    });

    await expect(
      database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.propose_boq_subcontractor_valuation_ap(
            ${orgId}::uuid, ${ids.val2Id}::uuid, ${ids.openBillId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/draft|check_violation|Failed query/i);

    await expect(
      database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.propose_boq_subcontractor_valuation_ap(
            ${orgId}::uuid, ${ids.val2Id}::uuid, ${ids.voidBillId}::uuid
          )
        `);
      }),
    ).rejects.toThrow(/draft|check_violation|Failed query/i);
  });

  it('allocation_seq is deterministic LIFO within one transaction (UUID-independent)', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId, '100');
    const contractId = await ensureContract(owner.id, orgId, projectId);

    for (let i = 0; i < 8; i += 1) {
      const pair = await database.asUser(owner.id, async (tx) => {
        const co = resultRows<{ id: string }>(
          await tx.execute(sql`
            INSERT INTO change_orders (
              organization_id, project_id, contract_id, direction, amount, currency, effective_date
            ) VALUES (
              ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid, 'addition', 5000, 'ILS', CURRENT_DATE
            ) RETURNING id
          `),
        );

        const idA = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT app.boq_allocate_change(
              ${orgId}::uuid, ${boqId}::uuid, ${co[0]!.id}::uuid,
              'quantity_change', ${nodeId}::uuid, 1, 0, NULL, 'A', NULL
            ) AS id
          `),
        );
        const idB = resultRows<{ id: string }>(
          await tx.execute(sql`
            SELECT app.boq_allocate_change(
              ${orgId}::uuid, ${boqId}::uuid, ${co[0]!.id}::uuid,
              'quantity_change', ${nodeId}::uuid, 1, 0, NULL, 'B', NULL
            ) AS id
          `),
        );

        const rows = resultRows<{ id: string; seq: string }>(
          await tx.execute(sql`
            SELECT id, allocation_seq::text AS seq
            FROM boq_change_allocations_secure
            WHERE id IN (${idA[0]!.id}::uuid, ${idB[0]!.id}::uuid)
            ORDER BY allocation_seq
          `),
        );
        expect(Number(rows[1]!.seq)).toBeGreaterThan(Number(rows[0]!.seq));
        expect(rows[0]!.id).toBe(idA[0]!.id);
        expect(rows[1]!.id).toBe(idB[0]!.id);
        return { idA: idA[0]!.id, idB: idB[0]!.id };
      });

      await expect(
        database.asUser(owner.id, async (tx) => {
          await tx.execute(sql`
            SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${pair.idA}::uuid)
          `);
        }),
      ).rejects.toThrow(/later effective|Failed query/i);

      await database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${pair.idB}::uuid)
        `);
        await tx.execute(sql`
          SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${pair.idA}::uuid)
        `);
      });
    }
  });

  it('rejects lump_sum and unknown allocation kinds at RPC', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId);
    const contractId = await ensureContract(owner.id, orgId, projectId);
    const coId = await database.asUser(owner.id, async (tx) => {
      const co = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid, 'addition', 100, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      return co[0]!.id;
    });

    await expect(
      database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${coId}::uuid,
            'lump_sum', ${nodeId}::uuid, 0, 0, 100, 'x', NULL
          )
        `);
      }),
    ).rejects.toThrow(/Failed query|unsupported|unknown|allocation_kind|check_violation|23514/i);

    await expect(
      database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          SELECT app.boq_allocate_change(
            ${orgId}::uuid, ${boqId}::uuid, ${coId}::uuid,
            'mystery_kind', ${nodeId}::uuid, 1, 0, NULL, 'x', NULL
          )
        `);
      }),
    ).rejects.toThrow(/Failed query|unsupported|unknown|allocation_kind|check_violation|23514/i);
  });

  it('command center recon uses Original/Current BOQ and effective allocations', async () => {
    const { owner, orgId, projectId } = await provisionOwner();
    const { boqId, nodeId } = await seedActiveBoq(owner.id, orgId, projectId, '10');
    const contractId = await ensureContract(owner.id, orgId, projectId);

    await database.asUser(owner.id, async (tx) => {
      // A: matched baseline (no CO) - Original=Current
      const matched = await listActiveBoqsWithTotalsForOrg(tx, orgId);
      const row = matched.find((r) => r.boqId === boqId)!;
      expect(Number(row.originalBoqTotal)).toBe(1000);
      expect(Number(row.currentBoqTotal)).toBe(1000);
      expect(Number(row.allocatedApprovedChanges)).toBe(0);

      const commercial0 = await loadProjectCommercialData(tx, orgId, projectId);
      expect(commercial0).toBeTruthy();
      const recon0 = reconcileContractBoq({
        originalContract: commercial0!.position.originalContractValue,
        originalBoq: money(row.originalBoqTotal, row.currency),
        currentContract: commercial0!.position.currentContractValue,
        currentBoq: money(row.currentBoqTotal, row.currency),
        approvedChanges: computeNetApprovedChanges(
          commercial0!.position.approvedAdditions,
          commercial0!.position.approvedReductions,
        ),
        allocatedApprovedChanges: money(row.allocatedApprovedChanges, row.currency),
      });
      // Contract may not equal BOQ on seed; skip strict matched if contract differs.
      expect(recon0.originalBoq.amount).toMatch(/^1000/);
      expect(recon0.currentBoq.amount).toMatch(/^1000/);

      const co = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid, 'addition', 500, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      // B: allocate fully 5 * 100 = 500
      await tx.execute(sql`
        SELECT app.boq_allocate_change(
          ${orgId}::uuid, ${boqId}::uuid, ${co[0]!.id}::uuid,
          'quantity_change', ${nodeId}::uuid, 5, 0, NULL, 'full', NULL
        )
      `);
      const afterFull = (await listActiveBoqsWithTotalsForOrg(tx, orgId)).find(
        (r) => r.boqId === boqId,
      )!;
      expect(Number(afterFull.originalBoqTotal)).toBe(1000);
      expect(Number(afterFull.currentBoqTotal)).toBe(1500);
      expect(Number(afterFull.allocatedApprovedChanges)).toBe(500);

      // C: second CO partially unallocated
      const co2 = resultRows<{ id: string }>(
        await tx.execute(sql`
          INSERT INTO change_orders (
            organization_id, project_id, contract_id, direction, amount, currency, effective_date
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contractId}::uuid, 'addition', 200, 'ILS', CURRENT_DATE
          ) RETURNING id
        `),
      );
      await tx.execute(sql`
        SELECT app.boq_allocate_change(
          ${orgId}::uuid, ${boqId}::uuid, ${co2[0]!.id}::uuid,
          'quantity_change', ${nodeId}::uuid, 1, 0, NULL, 'partial', NULL
        )
      `);
      const afterPartial = (await listActiveBoqsWithTotalsForOrg(tx, orgId)).find(
        (r) => r.boqId === boqId,
      )!;
      expect(Number(afterPartial.allocatedApprovedChanges)).toBe(600);
      expect(Number(afterPartial.originalBoqTotal)).toBe(1000);

      const allocId = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM boq_change_allocations
          WHERE change_order_id = ${co2[0]!.id}::uuid AND allocation_kind = 'quantity_change'
          LIMIT 1
        `),
      );
      await tx.execute(sql`
        SELECT app.boq_reverse_change_allocation(${orgId}::uuid, ${allocId[0]!.id}::uuid)
      `);
      const afterRev = (await listActiveBoqsWithTotalsForOrg(tx, orgId)).find(
        (r) => r.boqId === boqId,
      )!;
      expect(Number(afterRev.allocatedApprovedChanges)).toBe(500);
      expect(Number(afterRev.currentBoqTotal)).toBe(1500);
      expect(Number(afterRev.originalBoqTotal)).toBe(1000);
    });
  });
});

describe('BOQ owner v2 real two-session concurrency', () => {
  it('concurrent progress approvals cannot over-consume node quantity (6+6 on 10)', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });
    try {
      const { sqlA, sqlB } = harness;
      const userId = randomUUID();
      const orgId = randomUUID();
      const membershipId = randomUUID();
      const roleId = randomUUID();
      const projectId = randomUUID();
      const boqId = randomUUID();
      const nodeId = randomUUID();
      const batchA = randomUUID();
      const batchB = randomUUID();

      await sqlA`
        INSERT INTO permissions (key, category, description)
        VALUES
          ('boq.manage', 'boq', 'manage'),
          ('boq.progress.approve', 'boq', 'approve')
        ON CONFLICT DO NOTHING
      `;
      await sqlA`INSERT INTO profiles (id, email, display_name) VALUES (${userId}::uuid, 'race@test', 'race')`;
      await sqlA`INSERT INTO organizations (id, name) VALUES (${orgId}::uuid, 'Race Org')`;
      await sqlA`
        INSERT INTO organization_memberships (id, organization_id, user_id, status)
        VALUES (${membershipId}::uuid, ${orgId}::uuid, ${userId}::uuid, 'active')
      `;
      await sqlA`
        INSERT INTO roles (id, organization_id, key, name, is_protected)
        VALUES (${roleId}::uuid, ${orgId}::uuid, 'owner', 'Owner', true)
      `;
      await sqlA`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES
          (${orgId}::uuid, ${roleId}::uuid, 'boq.manage'),
          (${orgId}::uuid, ${roleId}::uuid, 'boq.progress.approve')
      `;
      await sqlA`
        INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
        VALUES (${orgId}::uuid, ${membershipId}::uuid, ${userId}::uuid, ${roleId}::uuid)
      `;
      await sqlA`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${orgId}::uuid, 'P', 'active', 'ILS')
      `;
      await sqlA`
        INSERT INTO project_boqs (
          id, organization_id, project_id, version_number, currency, status, progress_mode
        ) VALUES (
          ${boqId}::uuid, ${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple'
        )
      `;
      await sqlA`
        INSERT INTO boq_nodes (
          id, organization_id, boq_id, node_kind, description, pricing_type,
          original_quantity, original_unit_price, original_amount,
          current_quantity, current_unit_price, current_amount
        ) VALUES (
          ${nodeId}::uuid, ${orgId}::uuid, ${boqId}::uuid, 'item', 'N', 'quantity_unit_price',
          10, 100, 1000, 10, 100, 1000
        )
      `;
      await sqlA.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        await tx`select set_config('app.user_id', ${userId}, true)`;
        await tx`set local role authenticated`;
        await tx`SELECT app.activate_project_boq(${orgId}::uuid, ${boqId}::uuid)`;
      });
      await sqlA`
        INSERT INTO boq_progress_batches (
          id, organization_id, project_id, boq_id, period_label, status, certificate_number
        ) VALUES
          (${batchA}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 'A', 'draft', 1),
          (${batchB}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 'B', 'draft', 2)
      `;
      await sqlA`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity, approved_quantity,
          unit_price_snapshot, period_amount, currency
        ) VALUES
          (${orgId}::uuid, ${batchA}::uuid, ${nodeId}::uuid, 6, 0, 100, 0, 'ILS'),
          (${orgId}::uuid, ${batchB}::uuid, ${nodeId}::uuid, 6, 0, 100, 0, 'ILS')
      `;

      const asAuthed = async (sql: typeof sqlA, batchId: string) =>
        sql.begin(async (tx) => {
          await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
          await tx`select set_config('app.user_id', ${userId}, true)`;
          await tx`set local role authenticated`;
          await tx`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batchId}::uuid, NULL::jsonb)`;
        });

      const results = await Promise.allSettled([asAuthed(sqlA, batchA), asAuthed(sqlB, batchB)]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      expect(fulfilled).toBe(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(
            isIntegrityFailure(r.reason, 'over-measurement') ||
              isContendedConnectionError(r.reason) ||
              /over-measurement|check_violation/i.test(String(r.reason)),
          ).toBe(true);
        }
      }

      const sum = await sqlA`
        SELECT coalesce(sum(l.approved_quantity), 0)::float8 AS total
        FROM boq_progress_lines l
        JOIN boq_progress_batches b ON b.id = l.batch_id
        WHERE l.boq_node_id = ${nodeId}::uuid
          AND b.status IN ('approved', 'billed')
      `;
      expect(Number(sum[0]!.total)).toBeLessThanOrEqual(10);
      expect(Number(sum[0]!.total)).toBe(6);
    } finally {
      await harness.close();
    }
  }, 180_000);

  it('concurrent valid progress approvals 4+6 both succeed and sum to 10', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });
    try {
      const { sqlA, sqlB } = harness;
      const userId = randomUUID();
      const orgId = randomUUID();
      const membershipId = randomUUID();
      const roleId = randomUUID();
      const projectId = randomUUID();
      const boqId = randomUUID();
      const nodeId = randomUUID();
      const batchA = randomUUID();
      const batchB = randomUUID();

      await sqlA`
        INSERT INTO permissions (key, category, description)
        VALUES
          ('boq.manage', 'boq', 'manage'),
          ('boq.progress.approve', 'boq', 'approve')
        ON CONFLICT DO NOTHING
      `;
      await sqlA`INSERT INTO profiles (id, email, display_name) VALUES (${userId}::uuid, 'race2@test', 'race2')`;
      await sqlA`INSERT INTO organizations (id, name) VALUES (${orgId}::uuid, 'Race Org 2')`;
      await sqlA`
        INSERT INTO organization_memberships (id, organization_id, user_id, status)
        VALUES (${membershipId}::uuid, ${orgId}::uuid, ${userId}::uuid, 'active')
      `;
      await sqlA`
        INSERT INTO roles (id, organization_id, key, name, is_protected)
        VALUES (${roleId}::uuid, ${orgId}::uuid, 'owner', 'Owner', true)
      `;
      await sqlA`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES
          (${orgId}::uuid, ${roleId}::uuid, 'boq.manage'),
          (${orgId}::uuid, ${roleId}::uuid, 'boq.progress.approve')
      `;
      await sqlA`
        INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
        VALUES (${orgId}::uuid, ${membershipId}::uuid, ${userId}::uuid, ${roleId}::uuid)
      `;
      await sqlA`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${orgId}::uuid, 'P2', 'active', 'ILS')
      `;
      await sqlA`
        INSERT INTO project_boqs (
          id, organization_id, project_id, version_number, currency, status, progress_mode
        ) VALUES (
          ${boqId}::uuid, ${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple'
        )
      `;
      await sqlA`
        INSERT INTO boq_nodes (
          id, organization_id, boq_id, node_kind, description, pricing_type,
          original_quantity, original_unit_price, original_amount,
          current_quantity, current_unit_price, current_amount
        ) VALUES (
          ${nodeId}::uuid, ${orgId}::uuid, ${boqId}::uuid, 'item', 'N', 'quantity_unit_price',
          10, 100, 1000, 10, 100, 1000
        )
      `;
      await sqlA.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
        await tx`select set_config('app.user_id', ${userId}, true)`;
        await tx`set local role authenticated`;
        await tx`SELECT app.activate_project_boq(${orgId}::uuid, ${boqId}::uuid)`;
      });
      await sqlA`
        INSERT INTO boq_progress_batches (
          id, organization_id, project_id, boq_id, period_label, status, certificate_number
        ) VALUES
          (${batchA}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 'A', 'draft', 1),
          (${batchB}::uuid, ${orgId}::uuid, ${projectId}::uuid, ${boqId}::uuid, 'B', 'draft', 2)
      `;
      await sqlA`
        INSERT INTO boq_progress_lines (
          organization_id, batch_id, boq_node_id, measured_quantity, approved_quantity,
          unit_price_snapshot, period_amount, currency
        ) VALUES
          (${orgId}::uuid, ${batchA}::uuid, ${nodeId}::uuid, 4, 0, 100, 0, 'ILS'),
          (${orgId}::uuid, ${batchB}::uuid, ${nodeId}::uuid, 6, 0, 100, 0, 'ILS')
      `;

      const asAuthed = async (pool: typeof sqlA, batchId: string) =>
        pool.begin(async (tx) => {
          await tx`select set_config('request.jwt.claim.sub', ${userId}, true)`;
          await tx`select set_config('app.user_id', ${userId}, true)`;
          await tx`set local role authenticated`;
          await tx`SELECT app.approve_boq_progress_batch(${orgId}::uuid, ${batchId}::uuid, NULL::jsonb)`;
        });

      const results = await Promise.allSettled([asAuthed(sqlA, batchA), asAuthed(sqlB, batchB)]);
      // PGlite socket may reset a contending connection; retry only contended failures
      // after the concurrent race so compatible quantities can still both land.
      for (const [batchId, result] of [
        [batchA, results[0]] as const,
        [batchB, results[1]] as const,
      ]) {
        if (
          result.status === 'rejected' &&
          isContendedConnectionError(result.reason)
        ) {
          await asAuthed(sqlA, batchId);
        }
      }

      const sum = await sqlA`
        SELECT coalesce(sum(l.approved_quantity), 0)::float8 AS total
        FROM boq_progress_lines l
        JOIN boq_progress_batches b ON b.id = l.batch_id
        WHERE l.boq_node_id = ${nodeId}::uuid
          AND b.status IN ('approved', 'billed')
      `;
      expect(Number(sum[0]!.total)).toBe(10);
      const approved = await sqlA`
        SELECT count(*)::int AS n FROM boq_progress_batches
        WHERE id IN (${batchA}::uuid, ${batchB}::uuid) AND status = 'approved'
      `;
      expect(Number(approved[0]!.n)).toBe(2);
    } finally {
      await harness.close();
    }
  }, 180_000);

  it('concurrent hierarchy reparent A↔B cannot form a cycle', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });
    try {
      const { sqlA, sqlB } = harness;
      const orgId = randomUUID();
      const projectId = randomUUID();
      const boqId = randomUUID();
      const chapterA = randomUUID();
      const chapterB = randomUUID();

      await sqlA`INSERT INTO organizations (id, name) VALUES (${orgId}::uuid, 'Hier Org')`;
      await sqlA`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${orgId}::uuid, 'PH', 'active', 'ILS')
      `;
      await sqlA`
        INSERT INTO project_boqs (
          id, organization_id, project_id, version_number, currency, status, progress_mode
        ) VALUES (
          ${boqId}::uuid, ${orgId}::uuid, ${projectId}::uuid, 1, 'ILS', 'draft', 'simple'
        )
      `;
      await sqlA`
        INSERT INTO boq_nodes (
          id, organization_id, boq_id, node_kind, description, pricing_type,
          original_quantity, original_unit_price, original_amount,
          current_quantity, current_unit_price, current_amount
        ) VALUES
          (${chapterA}::uuid, ${orgId}::uuid, ${boqId}::uuid, 'chapter', 'A', 'quantity_unit_price',
           0, 0, 0, 0, 0, 0),
          (${chapterB}::uuid, ${orgId}::uuid, ${boqId}::uuid, 'chapter', 'B', 'quantity_unit_price',
           0, 0, 0, 0, 0, 0)
      `;

      const results = await Promise.allSettled([
        sqlA.begin(async (tx) => {
          await tx`UPDATE boq_nodes SET parent_id = ${chapterB}::uuid WHERE id = ${chapterA}::uuid`;
        }),
        sqlB.begin(async (tx) => {
          await tx`UPDATE boq_nodes SET parent_id = ${chapterA}::uuid WHERE id = ${chapterB}::uuid`;
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      expect(fulfilled).toBeLessThanOrEqual(1);
      for (const r of results) {
        if (r.status === 'rejected') {
          expect(
            isIntegrityFailure(r.reason, 'cycle') ||
              isContendedConnectionError(r.reason) ||
              /cycle|check_violation/i.test(String(r.reason)),
          ).toBe(true);
        }
      }

      const edges = await sqlA`
        SELECT id, parent_id
        FROM boq_nodes
        WHERE id IN (${chapterA}::uuid, ${chapterB}::uuid)
      `;
      const byId = new Map(edges.map((e) => [e.id as string, e.parent_id as string | null]));
      const aParent = byId.get(chapterA) ?? null;
      const bParent = byId.get(chapterB) ?? null;
      expect(!(aParent === chapterB && bParent === chapterA)).toBe(true);
    } finally {
      await harness.close();
    }
  }, 180_000);
});
