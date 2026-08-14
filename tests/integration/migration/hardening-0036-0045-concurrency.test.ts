import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applySqlMigrations } from '@tests/setup/database';
import {
  isContendedConnectionError,
  isIntegrityFailure,
  openTwoConnectionHarness,
} from '../pre0021/two-connection';

describe('overnight 0036–0045 concurrency', () => {
  it('0039 D: two concurrent 60 applications cannot both commit against a 100 payment', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });

    try {
      const orgId = randomUUID();
      const clientId = randomUUID();
      const billId = randomUUID();
      const paymentId = randomUUID();

      await harness.sqlA`
        INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
        VALUES (${orgId}::uuid, 'AR Race', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL')
      `;
      await harness.sqlA`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Client')
      `;
      await harness.sqlA`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency
        ) VALUES (
          ${billId}::uuid, ${orgId}::uuid, ${clientId}::uuid, '2026-08-01', 'finalized',
          1000, 1000, 'ILS'
        )
      `;
      await harness.sqlA`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentId}::uuid, ${orgId}::uuid, ${clientId}::uuid, 100, 'ILS', '2026-08-10', 'recorded'
        )
      `;

      const results = await Promise.allSettled([
        harness.sqlA.begin(async (tx) => {
          await tx`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentId}::uuid, ${billId}::uuid, 60, 'ILS'
            )
          `;
        }),
        harness.sqlB.begin(async (tx) => {
          await tx`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentId}::uuid, ${billId}::uuid, 60, 'ILS'
            )
          `;
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toBeLessThanOrEqual(1);
      expect(fulfilled + rejected.length).toBe(2);
      for (const result of rejected) {
        expect(
          isIntegrityFailure(result.reason, 'exceeds payment amount') ||
            isContendedConnectionError(result.reason) ||
            /exceeds|restrict/i.test(String(result.reason)),
        ).toBe(true);
      }

      const applied = await harness.sqlA`
        SELECT COALESCE(SUM(applied_amount), 0)::text AS total
        FROM payment_applications
        WHERE payment_id = ${paymentId}::uuid
      `;
      expect(Number(applied[0]?.total ?? 0)).toBeLessThanOrEqual(100);
    } finally {
      await harness.close();
    }
  });

  it('0039 E: two payments cannot concurrently over-apply one invoice', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });

    try {
      const orgId = randomUUID();
      const clientId = randomUUID();
      const billId = randomUUID();
      const paymentA = randomUUID();
      const paymentB = randomUUID();

      await harness.sqlA`
        INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
        VALUES (${orgId}::uuid, 'AR Bill Race', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL')
      `;
      await harness.sqlA`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Client')
      `;
      await harness.sqlA`
        INSERT INTO billing_records (
          id, organization_id, client_id, issue_date, status,
          subtotal_amount, total_amount, currency
        ) VALUES (
          ${billId}::uuid, ${orgId}::uuid, ${clientId}::uuid, '2026-08-01', 'finalized',
          100, 100, 'ILS'
        )
      `;
      await harness.sqlA`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES
          (${paymentA}::uuid, ${orgId}::uuid, ${clientId}::uuid, 80, 'ILS', '2026-08-10', 'recorded'),
          (${paymentB}::uuid, ${orgId}::uuid, ${clientId}::uuid, 80, 'ILS', '2026-08-10', 'recorded')
      `;

      const results = await Promise.allSettled([
        harness.sqlA.begin(async (tx) => {
          await tx`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentA}::uuid, ${billId}::uuid, 80, 'ILS'
            )
          `;
        }),
        harness.sqlB.begin(async (tx) => {
          await tx`
            INSERT INTO payment_applications (
              organization_id, payment_id, billing_record_id, applied_amount, currency
            ) VALUES (
              ${orgId}::uuid, ${paymentB}::uuid, ${billId}::uuid, 80, 'ILS'
            )
          `;
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      expect(fulfilled).toBeLessThanOrEqual(1);

      const applied = await harness.sqlA`
        SELECT COALESCE(SUM(a.applied_amount), 0)::text AS total
        FROM payment_applications a
        JOIN payments p ON p.id = a.payment_id
        WHERE a.billing_record_id = ${billId}::uuid AND p.status = 'recorded'
      `;
      expect(Number(applied[0]?.total ?? 0)).toBeLessThanOrEqual(100);
    } finally {
      await harness.close();
    }
  });

  it('0040: two concurrent receipts cannot over-receive a PO line', async () => {
    const harness = await openTwoConnectionHarness(async (client) => {
      await applySqlMigrations(client);
    });

    try {
      const orgId = randomUUID();
      const vendorId = randomUUID();
      const poId = randomUUID();
      const lineId = randomUUID();
      const receiptA = randomUUID();
      const receiptB = randomUUID();

      await harness.sqlA`
        INSERT INTO organizations (id, name, country_code, timezone, base_currency, default_locale)
        VALUES (${orgId}::uuid, 'PO Race', 'IL', 'Asia/Jerusalem', 'ILS', 'he-IL')
      `;
      await harness.sqlA`
        INSERT INTO vendors (id, organization_id, name)
        VALUES (${vendorId}::uuid, ${orgId}::uuid, 'V')
      `;
      await harness.sqlA`
        INSERT INTO purchase_orders (
          id, organization_id, vendor_id, status, currency, committed_amount
        ) VALUES (
          ${poId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, 'issued', 'ILS', 100
        )
      `;
      await harness.sqlA`
        INSERT INTO purchase_order_lines (
          id, organization_id, purchase_order_id, description, quantity, unit_amount, line_total, currency
        ) VALUES (
          ${lineId}::uuid, ${orgId}::uuid, ${poId}::uuid, 'Cable', 10, 10, 100, 'ILS'
        )
      `;
      await harness.sqlA`
        INSERT INTO po_receipts (id, organization_id, purchase_order_id, received_on) VALUES
          (${receiptA}::uuid, ${orgId}::uuid, ${poId}::uuid, '2026-08-14'),
          (${receiptB}::uuid, ${orgId}::uuid, ${poId}::uuid, '2026-08-14')
      `;

      const results = await Promise.allSettled([
        harness.sqlA.begin(async (tx) => {
          await tx`
            INSERT INTO po_receipt_lines (
              organization_id, receipt_id, purchase_order_line_id, quantity
            ) VALUES (
              ${orgId}::uuid, ${receiptA}::uuid, ${lineId}::uuid, 6
            )
          `;
        }),
        harness.sqlB.begin(async (tx) => {
          await tx`
            INSERT INTO po_receipt_lines (
              organization_id, receipt_id, purchase_order_line_id, quantity
            ) VALUES (
              ${orgId}::uuid, ${receiptB}::uuid, ${lineId}::uuid, 6
            )
          `;
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
      expect(fulfilled).toBeLessThanOrEqual(1);
      for (const result of results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')) {
        expect(
          isIntegrityFailure(result.reason, 'exceeds remaining') ||
            isContendedConnectionError(result.reason) ||
            /exceeds|restrict/i.test(String(result.reason)),
        ).toBe(true);
      }

      const received = await harness.sqlA`
        SELECT received_quantity::text AS qty
        FROM purchase_order_lines
        WHERE id = ${lineId}::uuid
      `;
      expect(Number(received[0]?.qty ?? 0)).toBeLessThanOrEqual(10);
    } finally {
      await harness.close();
    }
  });
});
