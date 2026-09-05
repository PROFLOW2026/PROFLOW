/**
 * Vendor payment persistence against `ap_payments` / `ap_payment_applications`.
 *
 * Financial invariant: these rows are cash / AP outstanding only - never Actual Cost.
 *
 * Production default: gated repository until `areApPaymentsAvailable()` is true,
 * then Drizzle. In-memory (`createInMemoryVendorPaymentsRepository`) is a TEST
 * DOUBLE ONLY - never the production financial path.
 *
 * Immutability (app layer):
 * - No delete API for payments or applications.
 * - No update of amount / currency / paymentDate / vendorId / appliedAmount.
 * - Void = status + voidedAt only.
 * - Optional metadata update: method / reference / notes on recorded payments.
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { apPaymentApplications, apPayments } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { ServiceUnavailableError } from '@/shared/errors';
import {
  areApPaymentsAvailable,
  setApPaymentsPersistenceReadyForTests,
  type ApPaymentStatus,
} from '../domain/vendor-payments';

export interface ApPaymentRow {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly status: ApPaymentStatus;
  readonly voidedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApPaymentApplicationRow {
  readonly id: string;
  readonly organizationId: string;
  readonly apPaymentId: string;
  readonly apBillId: string;
  readonly appliedAmount: string;
  readonly currency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApPaymentInsert {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: BusinessDate;
  readonly method: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
}

export interface ApPaymentApplicationInsert {
  readonly organizationId: string;
  readonly apPaymentId: string;
  readonly apBillId: string;
  readonly appliedAmount: string;
  readonly currency: string;
}

export interface ApPaymentMetadataPatch {
  readonly method?: string | null;
  readonly reference?: string | null;
  readonly notes?: string | null;
}

export interface ApPaymentWithApplications {
  readonly payment: ApPaymentRow;
  readonly applications: readonly ApPaymentApplicationRow[];
}

export interface VendorPaymentsRepository {
  insertPayment(db: DbExecutor, row: ApPaymentInsert): Promise<ApPaymentRow>;
  insertApplications(
    db: DbExecutor,
    rows: readonly ApPaymentApplicationInsert[],
  ): Promise<readonly ApPaymentApplicationRow[]>;
  findPaymentById(
    db: DbExecutor,
    organizationId: string,
    paymentId: string,
  ): Promise<ApPaymentRow | null>;
  /** Lock payment row (SELECT FOR UPDATE) before void / metadata. */
  lockPaymentForUpdate(
    db: DbExecutor,
    organizationId: string,
    paymentId: string,
  ): Promise<ApPaymentRow | null>;
  /** Lock bills in id order before allocating applications. */
  lockBillsForUpdate(
    db: DbExecutor,
    organizationId: string,
    billIds: readonly string[],
  ): Promise<void>;
  voidPayment(
    db: DbExecutor,
    organizationId: string,
    paymentId: string,
    voidedAt: Date,
  ): Promise<ApPaymentRow | null>;
  /** Non-financial metadata only - never amount/currency/date/vendor. */
  updatePaymentMetadata(
    db: DbExecutor,
    organizationId: string,
    paymentId: string,
    patch: ApPaymentMetadataPatch,
  ): Promise<ApPaymentRow | null>;
  listApplicationsForBill(
    db: DbExecutor,
    organizationId: string,
    apBillId: string,
  ): Promise<readonly ApPaymentApplicationRow[]>;
  listPaymentsForBill(
    db: DbExecutor,
    organizationId: string,
    apBillId: string,
  ): Promise<readonly ApPaymentWithApplications[]>;
  listActiveAppliedAmountsForBill(
    db: DbExecutor,
    organizationId: string,
    apBillId: string,
  ): Promise<readonly string[]>;
  listActiveAppliedAmountsForBills(
    db: DbExecutor,
    organizationId: string,
    apBillIds: readonly string[],
  ): Promise<Map<string, string[]>>;
}

function mapPayment(row: typeof apPayments.$inferSelect): ApPaymentRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    amount: row.amount,
    currency: row.currency,
    paymentDate: row.paymentDate as BusinessDate,
    method: row.method,
    reference: row.reference,
    notes: row.notes,
    status: row.status as ApPaymentStatus,
    voidedAt: row.voidedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapApplication(row: typeof apPaymentApplications.$inferSelect): ApPaymentApplicationRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    apPaymentId: row.apPaymentId,
    apBillId: row.apBillId,
    appliedAmount: row.appliedAmount,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function unavailable(): never {
  throw new ServiceUnavailableError(
    'Vendor payments require ap_payments schema (see src/modules/ap/SCHEMA_REQUEST.md)',
    'ap.errors.paymentsSchemaPending',
  );
}

/** Gated stub - used only when persistence flag is off. */
export const gatedVendorPaymentsRepository: VendorPaymentsRepository = {
  async insertPayment() {
    unavailable();
  },
  async insertApplications() {
    unavailable();
  },
  async findPaymentById() {
    if (!areApPaymentsAvailable()) unavailable();
    return null;
  },
  async lockPaymentForUpdate() {
    unavailable();
  },
  async lockBillsForUpdate() {
    unavailable();
  },
  async voidPayment() {
    unavailable();
  },
  async updatePaymentMetadata() {
    unavailable();
  },
  async listApplicationsForBill() {
    if (!areApPaymentsAvailable()) return [];
    unavailable();
  },
  async listPaymentsForBill() {
    if (!areApPaymentsAvailable()) return [];
    unavailable();
  },
  async listActiveAppliedAmountsForBill() {
    if (!areApPaymentsAvailable()) return [];
    unavailable();
  },
  async listActiveAppliedAmountsForBills(_db, _organizationId, apBillIds) {
    if (!areApPaymentsAvailable()) {
      return new Map(apBillIds.map((id) => [id, [] as string[]]));
    }
    unavailable();
  },
};

export const drizzleVendorPaymentsRepository: VendorPaymentsRepository = {
  async insertPayment(db, row) {
    const [inserted] = await db
      .insert(apPayments)
      .values({
        organizationId: row.organizationId,
        vendorId: row.vendorId,
        amount: row.amount,
        currency: row.currency,
        paymentDate: row.paymentDate,
        method: row.method,
        reference: row.reference,
        notes: row.notes,
        createdByUserId: row.createdByUserId,
        status: 'recorded',
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert AP payment');
    return mapPayment(inserted);
  },

  async insertApplications(db, rows) {
    if (rows.length === 0) return [];
    const inserted = await db
      .insert(apPaymentApplications)
      .values(
        rows.map((row) => ({
          organizationId: row.organizationId,
          apPaymentId: row.apPaymentId,
          apBillId: row.apBillId,
          appliedAmount: row.appliedAmount,
          currency: row.currency,
        })),
      )
      .returning();
    return inserted.map(mapApplication);
  },

  async findPaymentById(db, organizationId, paymentId) {
    const [row] = await db
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.id, paymentId), eq(apPayments.organizationId, organizationId)))
      .limit(1);
    return row ? mapPayment(row) : null;
  },

  async lockPaymentForUpdate(db, organizationId, paymentId) {
    await db.execute(sql`
      SELECT id
      FROM ap_payments
      WHERE id = ${paymentId}::uuid
        AND organization_id = ${organizationId}::uuid
      FOR UPDATE
    `);
    const [locked] = await db
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.id, paymentId), eq(apPayments.organizationId, organizationId)))
      .limit(1);
    return locked ? mapPayment(locked) : null;
  },

  async lockBillsForUpdate(db, organizationId, billIds) {
    if (billIds.length === 0) return;
    const sorted = [...new Set(billIds)].sort();
    await db.execute(sql`
      SELECT id
      FROM ap_bills
      WHERE organization_id = ${organizationId}::uuid
        AND id IN (${sql.join(
          sorted.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      ORDER BY id
      FOR UPDATE
    `);
  },

  async voidPayment(db, organizationId, paymentId, voidedAt) {
    const [row] = await db
      .update(apPayments)
      .set({ status: 'void', voidedAt, updatedAt: voidedAt })
      .where(
        and(
          eq(apPayments.id, paymentId),
          eq(apPayments.organizationId, organizationId),
          eq(apPayments.status, 'recorded'),
        ),
      )
      .returning();
    return row ? mapPayment(row) : null;
  },

  async updatePaymentMetadata(db, organizationId, paymentId, patch) {
    const [row] = await db
      .update(apPayments)
      .set({
        ...(patch.method !== undefined ? { method: patch.method } : {}),
        ...(patch.reference !== undefined ? { reference: patch.reference } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(apPayments.id, paymentId),
          eq(apPayments.organizationId, organizationId),
          eq(apPayments.status, 'recorded'),
        ),
      )
      .returning();
    return row ? mapPayment(row) : null;
  },

  async listApplicationsForBill(db, organizationId, apBillId) {
    const rows = await db
      .select()
      .from(apPaymentApplications)
      .where(
        and(
          eq(apPaymentApplications.organizationId, organizationId),
          eq(apPaymentApplications.apBillId, apBillId),
        ),
      );
    return rows.map(mapApplication);
  },

  async listPaymentsForBill(db, organizationId, apBillId) {
    const billApps = await db
      .select()
      .from(apPaymentApplications)
      .where(
        and(
          eq(apPaymentApplications.organizationId, organizationId),
          eq(apPaymentApplications.apBillId, apBillId),
        ),
      );
    if (billApps.length === 0) return [];

    const paymentIds = [...new Set(billApps.map((a) => a.apPaymentId))];
    const payments = await db
      .select()
      .from(apPayments)
      .where(and(eq(apPayments.organizationId, organizationId), inArray(apPayments.id, paymentIds)));

    const allApps = await db
      .select()
      .from(apPaymentApplications)
      .where(
        and(
          eq(apPaymentApplications.organizationId, organizationId),
          inArray(apPaymentApplications.apPaymentId, paymentIds),
        ),
      );

    return payments.map((payment) => ({
      payment: mapPayment(payment),
      applications: allApps
        .filter((a) => a.apPaymentId === payment.id)
        .map(mapApplication),
    }));
  },

  async listActiveAppliedAmountsForBill(db, organizationId, apBillId) {
    const map = await this.listActiveAppliedAmountsForBills(db, organizationId, [apBillId]);
    return map.get(apBillId) ?? [];
  },

  async listActiveAppliedAmountsForBills(db, organizationId, apBillIds) {
    const result = new Map<string, string[]>();
    for (const id of apBillIds) result.set(id, []);
    if (apBillIds.length === 0) return result;

    const apps = await db
      .select({
        apBillId: apPaymentApplications.apBillId,
        appliedAmount: apPaymentApplications.appliedAmount,
        paymentStatus: apPayments.status,
      })
      .from(apPaymentApplications)
      .innerJoin(apPayments, eq(apPaymentApplications.apPaymentId, apPayments.id))
      .where(
        and(
          eq(apPaymentApplications.organizationId, organizationId),
          inArray(apPaymentApplications.apBillId, [...apBillIds]),
          eq(apPayments.status, 'recorded'),
        ),
      );

    for (const app of apps) {
      result.get(app.apBillId)?.push(app.appliedAmount);
    }
    return result;
  },
};

let activeRepository: VendorPaymentsRepository = areApPaymentsAvailable()
  ? drizzleVendorPaymentsRepository
  : gatedVendorPaymentsRepository;

/**
 * Swap repository. Production must use gated (flag false) or Drizzle (flag true).
 * In-memory doubles are for unit tests only.
 */
export function setVendorPaymentsRepository(repo: VendorPaymentsRepository): void {
  activeRepository = repo;
}

export function getVendorPaymentsRepository(): VendorPaymentsRepository {
  return activeRepository;
}

export async function listRecordedPaymentsForVendor(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<readonly ApPaymentRow[]> {
  if (!areApPaymentsAvailable()) return [];
  const rows = await db
    .select()
    .from(apPayments)
    .where(and(eq(apPayments.organizationId, organizationId), eq(apPayments.vendorId, vendorId)))
    .orderBy(desc(apPayments.paymentDate), desc(apPayments.createdAt));
  return rows.map(mapPayment);
}

export function resetVendorPaymentsRepository(): void {
  activeRepository = areApPaymentsAvailable()
    ? drizzleVendorPaymentsRepository
    : gatedVendorPaymentsRepository;
}

/**
 * Test helper: force-enable persistence + bind the Drizzle repository.
 * Call from PGlite integration suites; clear in afterAll via
 * `disableApPaymentsPersistenceForTests`.
 */
export function enableApPaymentsPersistenceForTests(): void {
  setApPaymentsPersistenceReadyForTests(true);
  activeRepository = drizzleVendorPaymentsRepository;
}

export function disableApPaymentsPersistenceForTests(): void {
  setApPaymentsPersistenceReadyForTests(undefined);
  activeRepository = gatedVendorPaymentsRepository;
}

/**
 * In-memory double for unit/integration tests (tenant isolation + payment math).
 * Not used in production paths - financial truth requires Drizzle when ready.
 */
export function createInMemoryVendorPaymentsRepository(): VendorPaymentsRepository & {
  readonly _payments: ApPaymentRow[];
  readonly _applications: ApPaymentApplicationRow[];
} {
  const payments: ApPaymentRow[] = [];
  const applications: ApPaymentApplicationRow[] = [];
  let seq = 0;
  const nextId = () => {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  };

  return {
    _payments: payments,
    _applications: applications,

    async insertPayment(_db, row) {
      const now = new Date();
      const payment: ApPaymentRow = {
        id: nextId(),
        organizationId: row.organizationId,
        vendorId: row.vendorId,
        amount: row.amount,
        currency: row.currency,
        paymentDate: row.paymentDate,
        method: row.method,
        reference: row.reference,
        notes: row.notes,
        status: 'recorded',
        voidedAt: null,
        createdByUserId: row.createdByUserId,
        createdAt: now,
        updatedAt: now,
      };
      payments.push(payment);
      return payment;
    },

    async insertApplications(_db, rows) {
      const now = new Date();
      const inserted: ApPaymentApplicationRow[] = rows.map((row) => ({
        id: nextId(),
        organizationId: row.organizationId,
        apPaymentId: row.apPaymentId,
        apBillId: row.apBillId,
        appliedAmount: row.appliedAmount,
        currency: row.currency,
        createdAt: now,
        updatedAt: now,
      }));
      applications.push(...inserted);
      return inserted;
    },

    async findPaymentById(_db, organizationId, paymentId) {
      return (
        payments.find((p) => p.id === paymentId && p.organizationId === organizationId) ?? null
      );
    },

    async lockPaymentForUpdate(db, organizationId, paymentId) {
      return this.findPaymentById(db, organizationId, paymentId);
    },

    async lockBillsForUpdate() {
      // In-memory double - no row locks; domain re-validation still applies.
    },

    async voidPayment(_db, organizationId, paymentId, voidedAt) {
      const payment = payments.find(
        (p) => p.id === paymentId && p.organizationId === organizationId,
      );
      if (!payment || payment.status !== 'recorded') return null;
      const updated: ApPaymentRow = {
        ...payment,
        status: 'void',
        voidedAt,
        updatedAt: voidedAt,
      };
      const idx = payments.indexOf(payment);
      payments[idx] = updated;
      return updated;
    },

    async updatePaymentMetadata(_db, organizationId, paymentId, patch) {
      const payment = payments.find(
        (p) => p.id === paymentId && p.organizationId === organizationId && p.status === 'recorded',
      );
      if (!payment) return null;
      const updated: ApPaymentRow = {
        ...payment,
        method: patch.method !== undefined ? patch.method : payment.method,
        reference: patch.reference !== undefined ? patch.reference : payment.reference,
        notes: patch.notes !== undefined ? patch.notes : payment.notes,
        updatedAt: new Date(),
      };
      const idx = payments.indexOf(payment);
      payments[idx] = updated;
      return updated;
    },

    async listApplicationsForBill(_db, organizationId, apBillId) {
      return applications.filter(
        (a) => a.organizationId === organizationId && a.apBillId === apBillId,
      );
    },

    async listPaymentsForBill(_db, organizationId, apBillId) {
      const billApps = applications.filter(
        (a) => a.organizationId === organizationId && a.apBillId === apBillId,
      );
      const paymentIds = [...new Set(billApps.map((a) => a.apPaymentId))];
      const rows: ApPaymentWithApplications[] = [];
      for (const id of paymentIds) {
        const payment = payments.find(
          (p) => p.id === id && p.organizationId === organizationId,
        );
        if (!payment) continue;
        rows.push({
          payment,
          applications: applications.filter(
            (a) => a.organizationId === organizationId && a.apPaymentId === id,
          ),
        });
      }
      return rows;
    },

    async listActiveAppliedAmountsForBill(_db, organizationId, apBillId) {
      const amounts: string[] = [];
      for (const app of applications) {
        if (app.organizationId !== organizationId || app.apBillId !== apBillId) continue;
        const payment = payments.find(
          (p) => p.id === app.apPaymentId && p.organizationId === organizationId,
        );
        if (!payment || payment.status !== 'recorded') continue;
        amounts.push(app.appliedAmount);
      }
      return amounts;
    },

    async listActiveAppliedAmountsForBills(_db, organizationId, apBillIds) {
      const result = new Map<string, string[]>();
      for (const id of apBillIds) result.set(id, []);
      for (const app of applications) {
        if (app.organizationId !== organizationId) continue;
        if (!result.has(app.apBillId)) continue;
        const payment = payments.find(
          (p) => p.id === app.apPaymentId && p.organizationId === organizationId,
        );
        if (!payment || payment.status !== 'recorded') continue;
        result.get(app.apBillId)!.push(app.appliedAmount);
      }
      return result;
    },
  };
}

/**
 * Sum of cash payments made to vendors in a date range (by paymentDate).
 * Only "recorded" (non-voided) payments are counted.
 * Returns 0 if no payments found.
 */
export async function sumApPaymentsMadeInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<string> {
  const { gte, lte } = await import('drizzle-orm');
  const rows = await db
    .select({ amount: apPayments.amount })
    .from(apPayments)
    .where(
      and(
        eq(apPayments.organizationId, organizationId),
        eq(apPayments.currency, currency),
        sql`${apPayments.status} = 'recorded'`,
        gte(apPayments.paymentDate, fromDate),
        lte(apPayments.paymentDate, toDate),
      ),
    );

  let total = 0;
  for (const row of rows) {
    total += parseFloat(row.amount ?? '0');
  }
  return total.toFixed(2);
}
