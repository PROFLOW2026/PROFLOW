import { and, asc, eq } from 'drizzle-orm';
import { projectMarginSnapshots } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { MarginSnapshotAmounts, MarginTrendPoint } from '../domain/margin-trend';

export async function listProjectMarginSnapshots(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<MarginTrendPoint[]> {
  const rows = await db
    .select({
      yearMonth: projectMarginSnapshots.yearMonth,
      currency: projectMarginSnapshots.currency,
      contractValue: projectMarginSnapshots.contractValue,
      actualCost: projectMarginSnapshots.actualCost,
      forecastCost: projectMarginSnapshots.forecastCost,
      actualMargin: projectMarginSnapshots.actualMargin,
      forecastMargin: projectMarginSnapshots.forecastMargin,
    })
    .from(projectMarginSnapshots)
    .where(
      and(
        eq(projectMarginSnapshots.organizationId, organizationId),
        eq(projectMarginSnapshots.projectId, projectId),
      ),
    )
    .orderBy(asc(projectMarginSnapshots.yearMonth));

  return rows.map((row) => ({
    yearMonth: row.yearMonth,
    currency: row.currency.trim(),
    contractValue: row.contractValue,
    actualCost: row.actualCost,
    forecastCost: row.forecastCost,
    actualMargin: row.actualMargin,
    forecastMargin: row.forecastMargin,
  }));
}

/**
 * Upsert one month. Callers must already refuse closed and non-current months.
 * The conflict target is the single (org, project, year_month) row, so other months stay untouched.
 */
export async function upsertProjectMarginSnapshot(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly yearMonth: string;
  } & MarginSnapshotAmounts,
): Promise<void> {
  const now = new Date();
  await db
    .insert(projectMarginSnapshots)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      yearMonth: input.yearMonth,
      currency: input.currency,
      contractValue: input.contractValue,
      actualCost: input.actualCost,
      forecastCost: input.forecastCost,
      actualMargin: input.actualMargin,
      forecastMargin: input.forecastMargin,
      actualMarginPercent: input.actualMarginPercent,
      forecastMarginPercent: input.forecastMarginPercent,
      capturedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        projectMarginSnapshots.organizationId,
        projectMarginSnapshots.projectId,
        projectMarginSnapshots.yearMonth,
      ],
      set: {
        currency: input.currency,
        contractValue: input.contractValue,
        actualCost: input.actualCost,
        forecastCost: input.forecastCost,
        actualMargin: input.actualMargin,
        forecastMargin: input.forecastMargin,
        actualMarginPercent: input.actualMarginPercent,
        forecastMarginPercent: input.forecastMarginPercent,
        capturedAt: now,
        updatedAt: now,
      },
    });
}
