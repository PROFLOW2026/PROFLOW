import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { numeric, pgView, text, uuid } from 'drizzle-orm/pg-core';
import {
  subcontractAgreementFinancialTerms,
  subcontractAgreementProfiles,
  subcontractAgreements,
  subcontractValueEvents,
  vendors,
  workPackages,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { AgreementLifecycleStatus, AgreementOperationalView } from '../domain/types';

/**
 * Agreement persistence. Operational selects list columns explicitly and never read
 * `original_amount`, `retention_percent` or value events; financial selects are separate functions.
 */

/** Migration 0168 security-barrier view (header money column-revoked on base table). */
const subcontractAgreementMoneySecure = pgView('subcontract_agreement_money_secure', {
  id: uuid('id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  vendorId: uuid('vendor_id').notNull(),
  currency: text('currency').notNull(),
  originalAmount: numeric('original_amount', { precision: 18, scale: 6 }).notNull(),
  retentionPercent: numeric('retention_percent', { precision: 9, scale: 6 }),
}).existing();

const vendorName = sql<string | null>`app.dg_vendor_display_name(${subcontractAgreements.organizationId}, ${subcontractAgreements.vendorId})`;

const operationalColumns = {
  id: subcontractAgreements.id,
  organizationId: subcontractAgreements.organizationId,
  projectId: subcontractAgreements.projectId,
  vendorId: subcontractAgreements.vendorId,
  vendorName,
  subcontractNumber: subcontractAgreements.subcontractNumber,
  title: subcontractAgreements.title,
  status: subcontractAgreements.status,
  parentContractId: subcontractAgreements.parentContractId,
  startDate: subcontractAgreements.startDate,
  endDate: subcontractAgreements.endDate,
  trade: subcontractAgreementProfiles.trade,
  workPackageId: subcontractAgreementProfiles.workPackageId,
  scopeSummary: subcontractAgreementProfiles.scopeSummary,
  baselineLockedAt: subcontractAgreementProfiles.baselineLockedAt,
  activatedAt: subcontractAgreementProfiles.activatedAt,
  suspendedAt: subcontractAgreementProfiles.suspendedAt,
  suspensionReason: subcontractAgreementProfiles.suspensionReason,
  completedAt: subcontractAgreementProfiles.completedAt,
  closedAt: subcontractAgreementProfiles.closedAt,
};

type OperationalRow = {
  [K in keyof typeof operationalColumns]: unknown;
};

function toOperational(row: OperationalRow): AgreementOperationalView {
  return row as unknown as AgreementOperationalView;
}

export async function findAgreementOperational(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementOperationalView | null> {
  const [row] = await db
    .select(operationalColumns)
    .from(subcontractAgreements)
    .leftJoin(
      subcontractAgreementProfiles,
      and(
        eq(subcontractAgreementProfiles.agreementId, subcontractAgreements.id),
        eq(subcontractAgreementProfiles.organizationId, subcontractAgreements.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.id, agreementId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .limit(1);
  return row ? toOperational(row) : null;
}

export async function listProjectAgreementsOperational(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { vendorIds?: readonly string[]; limit?: number } = {},
): Promise<AgreementOperationalView[]> {
  const rows = await db
    .select(operationalColumns)
    .from(subcontractAgreements)
    .leftJoin(
      subcontractAgreementProfiles,
      and(
        eq(subcontractAgreementProfiles.agreementId, subcontractAgreements.id),
        eq(subcontractAgreementProfiles.organizationId, subcontractAgreements.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.projectId, projectId),
        isNull(subcontractAgreements.archivedAt),
        options.vendorIds ? inArray(subcontractAgreements.vendorId, [...options.vendorIds]) : undefined,
      ),
    )
    .orderBy(asc(subcontractAgreements.title))
    .limit(Math.min(options.limit ?? 200, 500));
  return rows.map(toOperational);
}

/** Row lock for state transitions (requires an UPDATE-capable caller). */
export async function lockAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<{
  id: string;
  projectId: string;
  vendorId: string;
  status: AgreementLifecycleStatus;
  currency: string;
  endDate: string | null;
} | null> {
  const [row] = await db
    .select({
      id: subcontractAgreements.id,
      projectId: subcontractAgreements.projectId,
      vendorId: subcontractAgreements.vendorId,
      status: subcontractAgreements.status,
      currency: subcontractAgreements.currency,
      endDate: subcontractAgreements.endDate,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.id, agreementId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .for('update')
    .limit(1);
  return row ? { ...row, status: row.status as AgreementLifecycleStatus } : null;
}

export interface AgreementFinancialRow {
  readonly currency: string;
  readonly originalAmount: string;
  readonly retentionPercent: string | null;
  readonly retentionCapPercent: string | null;
  readonly retentionCapAmount: string | null;
  readonly advancePercent: string | null;
  readonly advanceAmount: string | null;
  readonly advanceRecoveryMethod: 'none' | 'proportional' | 'fixed_percent_per_claim' | null;
  readonly advanceRecoveryPercent: string | null;
  readonly vatTreatment: 'standard' | 'reverse_charge' | 'exempt' | 'zero_rated' | 'not_applicable' | null;
  readonly paymentTermsDays: number | null;
  readonly paymentTermsText: string | null;
}

/**
 * FINANCIAL. Callers must hold contract.financial.view / ext.contract.view_value.
 * Null when the agreement is missing or its money is not visible to the caller.
 *
 * Header money is read from `subcontract_agreement_money_secure` (0168 column revoke on base table).
 */
export async function findAgreementFinancial(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<AgreementFinancialRow | null> {
  const [row] = await db
    .select({
      currency: subcontractAgreementMoneySecure.currency,
      originalAmount: subcontractAgreementMoneySecure.originalAmount,
      retentionPercent: subcontractAgreementMoneySecure.retentionPercent,
      retentionCapPercent: subcontractAgreementFinancialTerms.retentionCapPercent,
      retentionCapAmount: subcontractAgreementFinancialTerms.retentionCapAmount,
      advancePercent: subcontractAgreementFinancialTerms.advancePercent,
      advanceAmount: subcontractAgreementFinancialTerms.advanceAmount,
      advanceRecoveryMethod: subcontractAgreementFinancialTerms.advanceRecoveryMethod,
      advanceRecoveryPercent: subcontractAgreementFinancialTerms.advanceRecoveryPercent,
      vatTreatment: subcontractAgreementFinancialTerms.vatTreatment,
      paymentTermsDays: subcontractAgreementFinancialTerms.paymentTermsDays,
      paymentTermsText: subcontractAgreementFinancialTerms.paymentTermsText,
    })
    .from(subcontractAgreementMoneySecure)
    .innerJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractAgreementMoneySecure.id),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .leftJoin(
      subcontractAgreementFinancialTerms,
      and(
        eq(subcontractAgreementFinancialTerms.agreementId, subcontractAgreementMoneySecure.id),
        eq(subcontractAgreementFinancialTerms.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractAgreementMoneySecure.organizationId, organizationId),
        eq(subcontractAgreementMoneySecure.id, agreementId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** FINANCIAL batch read for project contractor lists (same visibility as {@link findAgreementFinancial}). */
export async function listAgreementFinancialForIds(
  db: DbExecutor,
  organizationId: string,
  agreementIds: readonly string[],
): Promise<Map<string, AgreementFinancialRow>> {
  const ids = [...new Set(agreementIds)].filter(Boolean);
  const result = new Map<string, AgreementFinancialRow>();
  if (ids.length === 0) return result;

  const rows = await db
    .select({
      agreementId: subcontractAgreementMoneySecure.id,
      currency: subcontractAgreementMoneySecure.currency,
      originalAmount: subcontractAgreementMoneySecure.originalAmount,
      retentionPercent: subcontractAgreementMoneySecure.retentionPercent,
      retentionCapPercent: subcontractAgreementFinancialTerms.retentionCapPercent,
      retentionCapAmount: subcontractAgreementFinancialTerms.retentionCapAmount,
      advancePercent: subcontractAgreementFinancialTerms.advancePercent,
      advanceAmount: subcontractAgreementFinancialTerms.advanceAmount,
      advanceRecoveryMethod: subcontractAgreementFinancialTerms.advanceRecoveryMethod,
      advanceRecoveryPercent: subcontractAgreementFinancialTerms.advanceRecoveryPercent,
      vatTreatment: subcontractAgreementFinancialTerms.vatTreatment,
      paymentTermsDays: subcontractAgreementFinancialTerms.paymentTermsDays,
      paymentTermsText: subcontractAgreementFinancialTerms.paymentTermsText,
    })
    .from(subcontractAgreementMoneySecure)
    .innerJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractAgreementMoneySecure.id),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .leftJoin(
      subcontractAgreementFinancialTerms,
      and(
        eq(subcontractAgreementFinancialTerms.agreementId, subcontractAgreementMoneySecure.id),
        eq(subcontractAgreementFinancialTerms.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractAgreementMoneySecure.organizationId, organizationId),
        inArray(subcontractAgreementMoneySecure.id, ids),
      ),
    );

  for (const row of rows) {
    const { agreementId, ...financial } = row;
    result.set(agreementId, financial);
  }
  return result;
}

/** FINANCIAL. */
export async function listAgreementValueEvents(db: DbExecutor, organizationId: string, agreementId: string) {
  return db
    .select({
      id: subcontractValueEvents.id,
      kind: subcontractValueEvents.kind,
      amount: subcontractValueEvents.amount,
      currency: subcontractValueEvents.currency,
      effectiveDate: subcontractValueEvents.effectiveDate,
      reason: subcontractValueEvents.reason,
      createdAt: subcontractValueEvents.createdAt,
    })
    .from(subcontractValueEvents)
    .where(
      and(eq(subcontractValueEvents.organizationId, organizationId), eq(subcontractValueEvents.subcontractId, agreementId)),
    )
    .orderBy(asc(subcontractValueEvents.createdAt));
}

export async function insertValueEvent(
  db: DbExecutor,
  values: typeof subcontractValueEvents.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(subcontractValueEvents).values(values).returning({ id: subcontractValueEvents.id });
  return row!.id;
}

export async function insertAgreement(
  db: DbExecutor,
  values: typeof subcontractAgreements.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(subcontractAgreements).values(values).returning({ id: subcontractAgreements.id });
  return row!.id;
}

export async function updateAgreementRow(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  patch: Partial<typeof subcontractAgreements.$inferInsert>,
  fromStatuses?: readonly AgreementLifecycleStatus[],
): Promise<boolean> {
  const rows = await db
    .update(subcontractAgreements)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        eq(subcontractAgreements.id, agreementId),
        fromStatuses ? inArray(subcontractAgreements.status, [...fromStatuses]) : undefined,
      ),
    )
    .returning({ id: subcontractAgreements.id });
  return rows.length > 0;
}

export async function upsertAgreementProfile(
  db: DbExecutor,
  values: typeof subcontractAgreementProfiles.$inferInsert,
): Promise<void> {
  const { agreementId: _id, organizationId: _org, createdByUserId: _by, ...patch } = values;
  await db
    .insert(subcontractAgreementProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: subcontractAgreementProfiles.agreementId,
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function upsertFinancialTerms(
  db: DbExecutor,
  values: typeof subcontractAgreementFinancialTerms.$inferInsert,
): Promise<void> {
  const { agreementId: _id, organizationId: _org, ...patch } = values;
  await db
    .insert(subcontractAgreementFinancialTerms)
    .values(values)
    .onConflictDoUpdate({
      target: subcontractAgreementFinancialTerms.agreementId,
      set: { ...patch, updatedAt: new Date() },
    });
}

/** Vendor row when the caller may read the vendor directory (org `vendors.read`); null otherwise. */
export async function findVendorForAgreement(db: DbExecutor, organizationId: string, vendorId: string) {
  const [row] = await db
    .select({ id: vendors.id, type: vendors.type, archivedAt: vendors.archivedAt })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), eq(vendors.id, vendorId)))
    .limit(1);
  return row ?? null;
}

/** Subcontractor-capable vendors for the create form (empty without org `vendors.read`). */
export async function listSubcontractorVendorOptions(db: DbExecutor, organizationId: string) {
  return db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
        inArray(vendors.type, ['subcontractor', 'both']),
      ),
    )
    .orderBy(asc(vendors.name))
    .limit(500);
}

export async function findWorkPackageInProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  workPackageId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: workPackages.id })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        eq(workPackages.id, workPackageId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listProjectWorkPackageOptions(db: DbExecutor, organizationId: string, projectId: string) {
  return db
    .select({ id: workPackages.id, name: workPackages.name })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        isNull(workPackages.archivedAt),
      ),
    )
    .orderBy(asc(workPackages.sortOrder), asc(workPackages.name))
    .limit(300);
}
