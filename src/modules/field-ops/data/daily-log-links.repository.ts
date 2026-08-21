import { and, eq, inArray } from 'drizzle-orm';
import {
  assets,
  dailyLogAssets,
  dailyLogEmployees,
  dailyLogVendors,
  employees,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function listDailyLogVendorIds(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
): Promise<string[]> {
  const rows = await db
    .select({ vendorId: dailyLogVendors.vendorId })
    .from(dailyLogVendors)
    .where(
      and(
        eq(dailyLogVendors.organizationId, organizationId),
        eq(dailyLogVendors.dailyLogId, dailyLogId),
      ),
    );
  return rows.map((row) => row.vendorId);
}

export async function listDailyLogEmployeeIds(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
): Promise<string[]> {
  const rows = await db
    .select({ employeeId: dailyLogEmployees.employeeId })
    .from(dailyLogEmployees)
    .where(
      and(
        eq(dailyLogEmployees.organizationId, organizationId),
        eq(dailyLogEmployees.dailyLogId, dailyLogId),
      ),
    );
  return rows.map((row) => row.employeeId);
}

export async function listDailyLogAssetIds(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
): Promise<string[]> {
  const rows = await db
    .select({ assetId: dailyLogAssets.assetId })
    .from(dailyLogAssets)
    .where(
      and(
        eq(dailyLogAssets.organizationId, organizationId),
        eq(dailyLogAssets.dailyLogId, dailyLogId),
      ),
    );
  return rows.map((row) => row.assetId);
}

export async function replaceDailyLogVendors(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
  vendorIds: readonly string[],
): Promise<void> {
  await db
    .delete(dailyLogVendors)
    .where(
      and(
        eq(dailyLogVendors.organizationId, organizationId),
        eq(dailyLogVendors.dailyLogId, dailyLogId),
      ),
    );
  const unique = [...new Set(vendorIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db.insert(dailyLogVendors).values(
    unique.map((vendorId) => ({
      organizationId,
      dailyLogId,
      vendorId,
    })),
  );
}

export async function replaceDailyLogEmployees(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
  employeeIds: readonly string[],
): Promise<void> {
  await db
    .delete(dailyLogEmployees)
    .where(
      and(
        eq(dailyLogEmployees.organizationId, organizationId),
        eq(dailyLogEmployees.dailyLogId, dailyLogId),
      ),
    );
  const unique = [...new Set(employeeIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db.insert(dailyLogEmployees).values(
    unique.map((employeeId) => ({
      organizationId,
      dailyLogId,
      employeeId,
    })),
  );
}

export async function replaceDailyLogAssets(
  db: DbExecutor,
  organizationId: string,
  dailyLogId: string,
  assetIds: readonly string[],
): Promise<void> {
  await db
    .delete(dailyLogAssets)
    .where(
      and(
        eq(dailyLogAssets.organizationId, organizationId),
        eq(dailyLogAssets.dailyLogId, dailyLogId),
      ),
    );
  const unique = [...new Set(assetIds.filter(Boolean))];
  if (unique.length === 0) return;
  await db.insert(dailyLogAssets).values(
    unique.map((assetId) => ({
      organizationId,
      dailyLogId,
      assetId,
    })),
  );
}

export async function assertVendorIdsInOrg(
  db: DbExecutor,
  organizationId: string,
  vendorIds: readonly string[],
): Promise<boolean> {
  if (vendorIds.length === 0) return true;
  const unique = [...new Set(vendorIds)];
  const rows = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, unique)));
  return rows.length === unique.length;
}

export async function assertEmployeeIdsInOrg(
  db: DbExecutor,
  organizationId: string,
  employeeIds: readonly string[],
): Promise<boolean> {
  if (employeeIds.length === 0) return true;
  const unique = [...new Set(employeeIds)];
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), inArray(employees.id, unique)));
  return rows.length === unique.length;
}

export async function assertAssetIdsInOrg(
  db: DbExecutor,
  organizationId: string,
  assetIds: readonly string[],
): Promise<boolean> {
  if (assetIds.length === 0) return true;
  const unique = [...new Set(assetIds)];
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), inArray(assets.id, unique)));
  return rows.length === unique.length;
}
