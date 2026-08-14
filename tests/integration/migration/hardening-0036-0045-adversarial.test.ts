import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string };
  return [e.message, e.detail, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function expectFailure(run: () => Promise<unknown>, token: string) {
  let message = '';
  try {
    await run();
  } catch (error) {
    message = errorBlob(error);
  }
  expect(message, `expected failure containing ${token}`).toContain(token);
}

describe('overnight 0036–0045 SQL adversarial', () => {
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

  it('0036: legacy_undivided cannot carry a tax split; historical undivided stays valid', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const vendorId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO vendors (id, organization_id, name, status, type)
        VALUES (${vendorId}::uuid, ${orgId}::uuid, 'V', 'active', 'supplier')
      `);
      await db.execute(sql`
        INSERT INTO ap_bills (
          organization_id, vendor_id, status, currency, total_amount,
          net_amount, tax_amount, gross_amount, tax_basis, bill_date
        ) VALUES (
          ${orgId}::uuid, ${vendorId}::uuid, 'open', 'ILS', 117,
          117, 0, 117, 'legacy_undivided', '2026-08-01'
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ap_bills (
              organization_id, vendor_id, status, currency, total_amount,
              net_amount, tax_amount, gross_amount, tax_basis, bill_date
            ) VALUES (
              ${orgId}::uuid, ${vendorId}::uuid, 'open', 'ILS', 117,
              100, 17, 117, 'legacy_undivided', '2026-08-01'
            )
          `),
        'legacy_undivided',
      );
      await db.execute(sql`
        INSERT INTO ap_bills (
          organization_id, vendor_id, status, currency, total_amount,
          net_amount, tax_amount, gross_amount, tax_basis, bill_date
        ) VALUES (
          ${orgId}::uuid, ${vendorId}::uuid, 'open', 'ILS', 117,
          100, 17, 117, 'canonical', '2026-08-01'
        )
      `);

      const creditId = randomUUID();
      await db.execute(sql`
        INSERT INTO ap_vendor_credits (
          id, organization_id, vendor_id, credit_date, currency, amount, status
        ) VALUES (
          ${creditId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, '2026-08-01', 'ILS', 1000, 'draft'
        )
      `);
      await db.execute(sql`
        UPDATE ap_vendor_credits SET amount = 1500 WHERE id = ${creditId}::uuid
      `);
      const credit = resultRows<{ amount: string; net: string; gross: string }>(
        await db.execute(sql`
          SELECT amount::text, net_amount::text AS net, gross_amount::text AS gross
          FROM ap_vendor_credits WHERE id = ${creditId}::uuid
        `),
      );
      expect(Number(credit[0]?.amount)).toBe(1500);
      expect(Number(credit[0]?.net)).toBe(1500);
      expect(Number(credit[0]?.gross)).toBe(1500);
    });
  });

  it('0037: closed-month payments may void, never resurrect; drafts stay insertable', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const clientId = randomUUID();
    const billId = randomUUID();
    const paymentId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Client')
      `);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency
        ) VALUES (
          ${billId}::uuid, ${orgId}::uuid, ${clientId}::uuid, '2024-01-10', 'finalized',
          100, 100, 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, billing_record_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentId}::uuid, ${orgId}::uuid, ${billId}::uuid, ${clientId}::uuid,
          100, 'ILS', '2024-01-15', 'recorded'
        )
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        INSERT INTO month_close_periods (organization_id, year_month, status)
        VALUES (${orgId}::uuid, '2024-01', 'open')
      `);
      await tx.execute(sql`
        UPDATE month_close_periods SET status = 'ready'
        WHERE organization_id = ${orgId}::uuid AND year_month = '2024-01'
      `);
      await tx.execute(sql`
        UPDATE month_close_periods SET status = 'closed'
        WHERE organization_id = ${orgId}::uuid AND year_month = '2024-01'
      `);

      await tx.execute(sql`
        INSERT INTO expenses (
          organization_id, expense_date, description, cost_family,
          net_amount, gross_amount, currency, status
        ) VALUES (
          ${orgId}::uuid, '2024-01-20', 'draft after close',
          'business_overhead', 10, 10, 'ILS', 'draft'
        )
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            INSERT INTO payments (
              organization_id, billing_record_id, client_id, amount, currency, payment_date, status
            ) VALUES (
              ${orgId}::uuid, ${billId}::uuid, ${clientId}::uuid, 10, 'ILS', '2024-01-21', 'recorded'
            )
          `),
        'closed_period_immutable',
      );
    });

    await database.asUser(userA.id, async (tx) => {
      await tx.execute(sql`
        UPDATE payments
        SET status = 'void', voided_at = now()
        WHERE id = ${paymentId}::uuid
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            UPDATE payments
            SET status = 'recorded', voided_at = NULL
            WHERE id = ${paymentId}::uuid
          `),
        'payment_lifecycle',
      );
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            UPDATE billing_records
            SET archived_at = now()
            WHERE id = ${billId}::uuid
          `),
        'closed_period_immutable',
      );
    });
  });

  it('0038: reversal_of is same-org and reversal_reason is immutable', async () => {
    const { orgA, orgB, userA } = await provisionTwoTenants(database);
    const projectA = randomUUID();
    const projectB = randomUUID();
    const contractA = randomUUID();
    const contractB = randomUUID();
    const coA = randomUUID();
    const coB = randomUUID();
    const reversal = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name) VALUES
          (${projectA}::uuid, ${orgA.organization.id}::uuid, 'PA'),
          (${projectB}::uuid, ${orgB.organization.id}::uuid, 'PB')
      `);
      await db.execute(sql`
        INSERT INTO contracts (id, organization_id, project_id, currency, status) VALUES
          (${contractA}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, 'ILS', 'active'),
          (${contractB}::uuid, ${orgB.organization.id}::uuid, ${projectB}::uuid, 'ILS', 'active')
      `);
      await db.execute(sql`
        INSERT INTO change_orders (
          id, organization_id, project_id, contract_id, direction, amount, currency, effective_date
        ) VALUES
          (${coA}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, ${contractA}::uuid,
           'addition', 100, 'ILS', '2026-08-01'),
          (${coB}::uuid, ${orgB.organization.id}::uuid, ${projectB}::uuid, ${contractB}::uuid,
           'addition', 100, 'ILS', '2026-08-01')
      `);

      await expectFailure(
        async () => {
          await db.execute(sql`SELECT set_config('app.co_reversal_latch', ${coB}::text, false)`);
          await db.execute(sql`
            INSERT INTO change_orders (
              id, organization_id, project_id, contract_id, direction, amount, currency,
              effective_date, reversal_of_change_order_id, reversal_reason
            ) VALUES (
              ${reversal}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, ${contractA}::uuid,
              'reduction', 100, 'ILS', '2026-08-14', ${coB}::uuid, 'cross-org'
            )
          `);
        },
        'reverse_change_order',
      );

      await expectFailure(
        async () => {
          await db.execute(sql`SELECT set_config('app.co_reversal_latch', ${coA}::text, false)`);
          await db.execute(sql`
            INSERT INTO change_orders (
              id, organization_id, project_id, contract_id, direction, amount, currency,
              effective_date, reversal_of_change_order_id, reversal_reason
            ) VALUES (
              ${reversal}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, ${contractA}::uuid,
              'reduction', 100, 'ILS', '2026-08-14', ${coA}::uuid, 'audit reason'
            )
          `);
        },
        'reverse_change_order',
      );

      await expectFailure(
        async () => {
          await db.transaction(async (tx) => {
            await tx.execute(sql`
              INSERT INTO app.co_reversal_ctx (pid, txid, organization_id, change_order_id)
              VALUES (
                pg_backend_pid(), txid_current(),
                ${orgA.organization.id}::uuid, ${coB}::uuid
              )
            `);
            await tx.execute(sql`
              INSERT INTO change_orders (
                id, organization_id, project_id, contract_id, direction, amount, currency,
                effective_date, reversal_of_change_order_id, reversal_reason
              ) VALUES (
                ${reversal}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, ${contractA}::uuid,
                'reduction', 100, 'ILS', '2026-08-14', ${coB}::uuid, 'cross-org'
              )
            `);
          });
        },
        'change_orders_reversal_of_org_fk',
      );

      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO app.co_reversal_ctx (pid, txid, organization_id, change_order_id)
          VALUES (
            pg_backend_pid(), txid_current(),
            ${orgA.organization.id}::uuid, ${coA}::uuid
          )
        `);
        await tx.execute(sql`
          INSERT INTO change_orders (
            id, organization_id, project_id, contract_id, direction, amount, currency,
            effective_date, reversal_of_change_order_id, reversal_reason
          ) VALUES (
            ${reversal}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, ${contractA}::uuid,
            'reduction', 100, 'ILS', '2026-08-14', ${coA}::uuid, 'audit reason'
          )
        `);
      });

      await expectFailure(
        () =>
          db.execute(sql`
            UPDATE change_orders SET reversal_reason = 'edited' WHERE id = ${reversal}::uuid
          `),
        'immutable',
      );
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            INSERT INTO app.co_reversal_ctx (pid, txid, organization_id, change_order_id)
            VALUES (
              pg_backend_pid(), txid_current(),
              ${orgA.organization.id}::uuid, ${coA}::uuid
            )
          `),
        'permission denied',
      );
    });
  });

  it('0039 A/B/C: NEW amount is included; sequential remainder is allowed', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const clientId = randomUUID();
    const billId = randomUUID();
    const paymentA = randomUUID();
    const paymentB = randomUUID();
    const paymentC = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Alpha')
      `);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency
        ) VALUES (
          ${billId}::uuid, ${orgId}::uuid, ${clientId}::uuid, '2026-08-01', 'finalized',
          1000, 1000, 'ILS'
        )
      `);

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentA}::uuid, ${orgId}::uuid, ${clientId}::uuid, 100, 'ILS', '2026-08-10', 'recorded'
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentA}::uuid, ${billId}::uuid, 120, 'ILS'
            )
          `),
        'exceeds payment amount',
      );

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentB}::uuid, ${orgId}::uuid, ${clientId}::uuid, 100, 'ILS', '2026-08-11', 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO payment_applications (
          organization_id, payment_id, billing_record_id, applied_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${paymentB}::uuid, ${billId}::uuid, 60, 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO payment_applications (
          organization_id, payment_id, billing_record_id, applied_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${paymentB}::uuid, ${billId}::uuid, 40, 'ILS'
        )
      `);

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentC}::uuid, ${orgId}::uuid, ${clientId}::uuid, 100, 'ILS', '2026-08-12', 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO payment_applications (
          organization_id, payment_id, billing_record_id, applied_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${paymentC}::uuid, ${billId}::uuid, 60, 'ILS'
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentC}::uuid, ${billId}::uuid, 50, 'ILS'
            )
          `),
        'exceeds payment amount',
      );

      await expectFailure(
        () =>
          db.execute(sql`
            UPDATE payments SET amount = 40 WHERE id = ${paymentC}::uuid
          `),
        'payment_economic_immutable',
      );
    });
  });

  it('0039: applications cannot consume held retention; split payments require same client', async () => {
    const { orgA, orgB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const clientA = randomUUID();
    const clientB = randomUUID();
    const otherClient = randomUUID();
    const billHeld = randomUUID();
    const billA = randomUUID();
    const billOther = randomUUID();
    const paymentHeld = randomUUID();
    const paymentSplit = randomUUID();
    const paymentCross = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name) VALUES
          (${clientA}::uuid, ${orgId}::uuid, 'A'),
          (${clientB}::uuid, ${orgId}::uuid, 'B'),
          (${otherClient}::uuid, ${orgB.organization.id}::uuid, 'Other org')
      `);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency,
          retention_amount, retention_held_remaining
        ) VALUES (
          ${billHeld}::uuid, ${orgId}::uuid, ${clientA}::uuid, '2026-08-01', 'finalized',
          1000, 1000, 'ILS', 100, 100
        )
      `);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency
        ) VALUES
          (${billA}::uuid, ${orgId}::uuid, ${clientA}::uuid, '2026-08-02', 'finalized', 500, 500, 'ILS'),
          (${billOther}::uuid, ${orgId}::uuid, ${clientB}::uuid, '2026-08-02', 'finalized', 500, 500, 'ILS')
      `);

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentHeld}::uuid, ${orgId}::uuid, ${clientA}::uuid, 1000, 'ILS', '2026-08-10', 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO payment_applications (
          organization_id, payment_id, billing_record_id, applied_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${paymentHeld}::uuid, ${billHeld}::uuid, 900, 'ILS'
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentHeld}::uuid, ${billHeld}::uuid, 1, 'ILS'
            )
          `),
        'collectible',
      );

      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payments (
              organization_id, amount, currency, payment_date, status
            ) VALUES (
              ${orgId}::uuid, 50, 'ILS', '2026-08-11', 'recorded'
            )
          `),
        'payments_split_requires_client',
      );

      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payments (
              organization_id, client_id, amount, currency, payment_date, status
            ) VALUES (
              ${orgId}::uuid, ${otherClient}::uuid, 50, 'ILS', '2026-08-11', 'recorded'
            )
          `),
        'payments_client_org_fk',
      );

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentSplit}::uuid, ${orgId}::uuid, ${clientA}::uuid, 100, 'ILS', '2026-08-12', 'recorded'
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentSplit}::uuid, ${billOther}::uuid, 10, 'ILS'
            )
          `),
        'invoice client must match',
      );

      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentCross}::uuid, ${orgId}::uuid, ${clientA}::uuid, 10, 'ILS', '2026-08-13', 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO payment_applications (
          organization_id, payment_id, billing_record_id, applied_amount, currency
        ) VALUES (
          ${orgId}::uuid, ${paymentSplit}::uuid, ${billA}::uuid, 10, 'ILS'
        )
      `);
    });
  });

  it('0040: receipt history is the only path; full qty stays partially_received', async () => {
    const { orgA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const vendorId = randomUUID();
    const poId = randomUUID();
    const lineId = randomUUID();
    const receiptId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO vendors (id, organization_id, name)
        VALUES (${vendorId}::uuid, ${orgId}::uuid, 'Supplier')
      `);
      await db.execute(sql`
        INSERT INTO purchase_orders (
          id, organization_id, vendor_id, status, currency, committed_amount
        ) VALUES (
          ${poId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, 'issued', 'ILS', 100
        )
      `);
      await db.execute(sql`
        INSERT INTO purchase_order_lines (
          id, organization_id, purchase_order_id, description, quantity, unit_amount, line_total, currency
        ) VALUES (
          ${lineId}::uuid, ${orgId}::uuid, ${poId}::uuid, 'Cable', 10, 10, 100, 'ILS'
        )
      `);

      await expectFailure(
        () =>
          db.execute(sql`
            UPDATE purchase_order_lines SET received_quantity = 3 WHERE id = ${lineId}::uuid
          `),
        'receipt-history only',
      );

      await db.execute(sql`
        INSERT INTO po_receipts (id, organization_id, purchase_order_id, received_on)
        VALUES (${receiptId}::uuid, ${orgId}::uuid, ${poId}::uuid, '2026-08-14')
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO po_receipt_lines (
              organization_id, receipt_id, purchase_order_line_id, quantity
            ) VALUES (
              ${orgId}::uuid, ${receiptId}::uuid, ${lineId}::uuid, 11
            )
          `),
        'exceeds remaining',
      );
      await db.execute(sql`
        INSERT INTO po_receipt_lines (
          organization_id, receipt_id, purchase_order_line_id, quantity
        ) VALUES (
          ${orgId}::uuid, ${receiptId}::uuid, ${lineId}::uuid, 10
        )
      `);

      const po = resultRows<{ status: string; received: string }>(
        await db.execute(sql`
          SELECT po.status, pol.received_quantity::text AS received
          FROM purchase_orders po
          JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
          WHERE po.id = ${poId}::uuid
        `),
      );
      expect(po[0]?.status).toBe('partially_received');
      expect(Number(po[0]?.received)).toBe(10);

      await expectFailure(
        () =>
          db.execute(sql`
            UPDATE po_receipt_lines SET quantity = 1 WHERE receipt_id = ${receiptId}::uuid
          `),
        'po_receipt_lines',
      );
    });
  });

  it('0044: location FKs, movement semantics, and movement-driven balances', async () => {
    const { orgA, orgB } = await provisionTwoTenants(database);
    const itemId = randomUUID();
    const locA = randomUUID();
    const locB = randomUUID();
    const locOther = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO inventory_items (id, organization_id, name, unit, quantity_on_hand)
        VALUES (${itemId}::uuid, ${orgA.organization.id}::uuid, 'Cable', 'm', 0)
      `);
      await db.execute(sql`
        INSERT INTO inventory_locations (id, organization_id, name, code) VALUES
          (${locA}::uuid, ${orgA.organization.id}::uuid, 'Main', 'MAIN'),
          (${locB}::uuid, ${orgA.organization.id}::uuid, 'Yard', 'YARD'),
          (${locOther}::uuid, ${orgB.organization.id}::uuid, 'Other', 'O')
      `);

      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO inventory_movements (
              organization_id, inventory_item_id, movement_type, quantity, occurred_on, to_location_id
            ) VALUES (
              ${orgA.organization.id}::uuid, ${itemId}::uuid, 'receive', 5, '2026-08-14', ${locOther}::uuid
            )
          `),
        'inventory_movements_to_loc_org_fk',
      );

      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO inventory_movements (
              organization_id, inventory_item_id, movement_type, quantity, occurred_on,
              from_location_id, to_location_id
            ) VALUES (
              ${orgA.organization.id}::uuid, ${itemId}::uuid, 'receive', 5, '2026-08-14',
              ${locA}::uuid, ${locB}::uuid
            )
          `),
        'requires to_location_id only',
      );

      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO inventory_movements (
              organization_id, inventory_item_id, movement_type, quantity, occurred_on,
              from_location_id, to_location_id
            ) VALUES (
              ${orgA.organization.id}::uuid, ${itemId}::uuid, 'transfer', 1, '2026-08-14',
              ${locA}::uuid, ${locA}::uuid
            )
          `),
        'distinct from and to',
      );

      await db.execute(sql`
        INSERT INTO inventory_movements (
          organization_id, inventory_item_id, movement_type, quantity, occurred_on, to_location_id
        ) VALUES (
          ${orgA.organization.id}::uuid, ${itemId}::uuid, 'receive', 5, '2026-08-14', ${locA}::uuid
        )
      `);

      await expectFailure(
        () =>
          db.execute(sql`
            UPDATE inventory_location_balances SET quantity = 999
            WHERE inventory_item_id = ${itemId}::uuid
          `),
        'movement-driven only',
      );

      const header = resultRows<{ qty: string }>(
        await db.execute(sql`
          SELECT quantity_on_hand::text AS qty FROM inventory_items WHERE id = ${itemId}::uuid
        `),
      );
      expect(Number(header[0]?.qty)).toBe(5);
    });
  });

  it('0045: authenticated cannot DML boq_nodes; draft RPC is member+boq.manage only', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const projectA = randomUUID();
    const projectB = randomUUID();
    const boqA = randomUUID();
    const boqB = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name) VALUES
          (${projectA}::uuid, ${orgA.organization.id}::uuid, 'PA'),
          (${projectB}::uuid, ${orgB.organization.id}::uuid, 'PB')
      `);
      await db.execute(sql`
        INSERT INTO project_boqs (
          id, organization_id, project_id, version_number, currency, status, progress_mode
        ) VALUES
          (${boqA}::uuid, ${orgA.organization.id}::uuid, ${projectA}::uuid, 1, 'ILS', 'draft', 'simple'),
          (${boqB}::uuid, ${orgB.organization.id}::uuid, ${projectB}::uuid, 1, 'ILS', 'draft', 'simple')
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            INSERT INTO boq_nodes (
              organization_id, boq_id, node_kind, description, pricing_type,
              original_quantity, original_unit_price, original_amount,
              current_quantity, current_unit_price, current_amount
            ) VALUES (
              ${orgA.organization.id}::uuid, ${boqA}::uuid, 'item', 'raw', 'quantity_unit_price',
              1, 1, 1, 1, 1, 1
            )
          `),
        'permission denied',
      );
    });

    const nodeId = await database.asUser(userA.id, async (tx) => {
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT app.boq_mutate_draft_node(
            ${orgA.organization.id}::uuid,
            'insert',
            NULL::uuid,
            jsonb_build_object(
              'boq_id', ${boqA}::uuid,
              'node_kind', 'item',
              'description', 'RPC item',
              'pricing_type', 'quantity_unit_price',
              'original_quantity', 10,
              'original_unit_price', 100,
              'original_amount', 1000,
              'current_quantity', 10,
              'current_unit_price', 100,
              'current_amount', 1000
            )
          ) AS id
        `),
      );
      return rows[0]!.id;
    });
    expect(nodeId).toBeTruthy();

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            SELECT app.boq_mutate_draft_node(
              ${orgB.organization.id}::uuid,
              'insert',
              NULL::uuid,
              jsonb_build_object(
                'boq_id', ${boqB}::uuid,
                'node_kind', 'item',
                'description', 'cross-org',
                'pricing_type', 'quantity_unit_price',
                'original_quantity', 1,
                'original_unit_price', 1,
                'original_amount', 1,
                'current_quantity', 1,
                'current_unit_price', 1,
                'current_amount', 1
              )
            )
          `),
        'not org member',
      );
    });

    await database.asUser(userB.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            SELECT app.boq_mutate_draft_node(
              ${orgA.organization.id}::uuid,
              'update',
              ${nodeId}::uuid,
              jsonb_build_object('description', 'hijack')
            )
          `),
        'not org member',
      );
    });

    await database.asService(async (db) => {
      const count = resultRows<{ n: string }>(
        await db.execute(sql`
          SELECT count(*)::text AS n FROM boq_nodes WHERE boq_id = ${boqB}::uuid
        `),
      );
      expect(Number(count[0]?.n)).toBe(0);
    });

    await database.asUser(userA.id, async (tx) => {
      await expectFailure(
        () =>
          tx.execute(sql`
            SELECT app.boq_reverse_allocations_for_change_order(
              ${orgA.organization.id}::uuid,
              ${randomUUID()}::uuid,
              'standalone'
            )
          `),
        'permission denied',
      );
    });
  });
});
