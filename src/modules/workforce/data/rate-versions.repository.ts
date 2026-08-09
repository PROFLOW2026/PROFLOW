import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { laborCostComponents, rateVersions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { LaborCostComponentRecord, RateVersionRecord } from '../domain/types';

function mapRateVersion(row: typeof rateVersions.$inferSelect): RateVersionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    baseRate: row.baseRate,
    rateUnit: row.rateUnit,
    currency: row.currency,
    burdenPercent: row.burdenPercent,
    correctsRateVersionId: row.correctsRateVersionId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapComponent(row: typeof laborCostComponents.$inferSelect): LaborCostComponentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    rateVersionId: row.rateVersionId,
    key: row.key,
    label: row.label,
    basis: row.basis,
    amount: row.amount,
    percent: row.percent,
    currency: row.currency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertRateVersion(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    validFrom: string;
    validTo?: string | null;
    baseRate: string;
    rateUnit: RateVersionRecord['rateUnit'];
    currency: string;
    burdenPercent?: string | null;
    correctsRateVersionId?: string | null;
    notes?: string | null;
  },
): Promise<RateVersionRecord> {
  const [row] = await db
    .insert(rateVersions)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      baseRate: input.baseRate,
      rateUnit: input.rateUnit,
      currency: input.currency,
      burdenPercent: input.burdenPercent ?? null,
      correctsRateVersionId: input.correctsRateVersionId ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapRateVersion(row!);
}

export async function closeOpenRateVersionBefore(
  db: DbExecutor,
  input: { organizationId: string; rateVersionId: string; validTo: string },
): Promise<void> {
  await db
    .update(rateVersions)
    .set({ validTo: input.validTo, updatedAt: new Date() })
    .where(
      and(
        eq(rateVersions.organizationId, input.organizationId),
        eq(rateVersions.id, input.rateVersionId),
        isNull(rateVersions.validTo),
      ),
    );
}

export async function findOpenRateVersionByEmployee(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<RateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(rateVersions)
    .where(
      and(
        eq(rateVersions.organizationId, organizationId),
        eq(rateVersions.employeeId, employeeId),
        isNull(rateVersions.validTo),
      ),
    )
    .orderBy(desc(rateVersions.validFrom))
    .limit(1);

  return row ? mapRateVersion(row) : null;
}

export async function listRateVersionsByEmployee(
  db: DbExecutor,
  organizationId: string,
  employeeId: string,
): Promise<RateVersionRecord[]> {
  const rows = await db
    .select()
    .from(rateVersions)
    .where(and(eq(rateVersions.organizationId, organizationId), eq(rateVersions.employeeId, employeeId)))
    .orderBy(desc(rateVersions.validFrom), desc(rateVersions.createdAt));

  return rows.map(mapRateVersion);
}

export async function findRateVersionById(
  db: DbExecutor,
  organizationId: string,
  rateVersionId: string,
): Promise<RateVersionRecord | null> {
  const [row] = await db
    .select()
    .from(rateVersions)
    .where(and(eq(rateVersions.id, rateVersionId), eq(rateVersions.organizationId, organizationId)))
    .limit(1);

  return row ? mapRateVersion(row) : null;
}

export async function insertLaborCostComponent(
  db: DbExecutor,
  input: {
    organizationId: string;
    rateVersionId: string;
    key: string;
    label: string;
    basis: LaborCostComponentRecord['basis'];
    amount?: string | null;
    percent?: string | null;
    currency?: string | null;
  },
): Promise<LaborCostComponentRecord> {
  const [row] = await db
    .insert(laborCostComponents)
    .values({
      organizationId: input.organizationId,
      rateVersionId: input.rateVersionId,
      key: input.key,
      label: input.label,
      basis: input.basis,
      amount: input.amount ?? null,
      percent: input.percent ?? null,
      currency: input.currency ?? null,
    })
    .returning();

  return mapComponent(row!);
}

export async function listComponentsByRateVersion(
  db: DbExecutor,
  organizationId: string,
  rateVersionId: string,
): Promise<LaborCostComponentRecord[]> {
  const rows = await db
    .select()
    .from(laborCostComponents)
    .where(
      and(
        eq(laborCostComponents.organizationId, organizationId),
        eq(laborCostComponents.rateVersionId, rateVersionId),
      ),
    )
    .orderBy(asc(laborCostComponents.key));

  return rows.map(mapComponent);
}

export async function listComponentsByRateVersions(
  db: DbExecutor,
  organizationId: string,
  rateVersionIds: readonly string[],
): Promise<LaborCostComponentRecord[]> {
  if (rateVersionIds.length === 0) return [];

  const rows = await db
    .select()
    .from(laborCostComponents)
    .where(eq(laborCostComponents.organizationId, organizationId));

  const allowed = new Set(rateVersionIds);
  return rows.filter((row) => allowed.has(row.rateVersionId)).map(mapComponent);
}
