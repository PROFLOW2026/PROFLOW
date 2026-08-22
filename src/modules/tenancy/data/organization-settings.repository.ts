import { and, eq, inArray } from 'drizzle-orm';
import { organizationSettings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function getOrganizationSettingValue<T>(
  db: DbExecutor,
  organizationId: string,
  key: string,
): Promise<T | null> {
  const [row] = await db
    .select({ id: organizationSettings.id, value: organizationSettings.value })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        eq(organizationSettings.key, key),
      ),
    )
    .limit(1);

  return (row?.value as T | undefined) ?? null;
}

/** Single round-trip for shell / bootstrap reads that need several keys. */
export async function listOrganizationSettingValues(
  db: DbExecutor,
  organizationId: string,
  keys: readonly string[],
): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map();

  const rows = await db
    .select({ key: organizationSettings.key, value: organizationSettings.value })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        inArray(organizationSettings.key, [...keys]),
      ),
    );

  return new Map(rows.map((row) => [row.key, row.value]));
}

export async function upsertOrganizationSettingValue(
  db: DbExecutor,
  organizationId: string,
  key: string,
  value: unknown,
): Promise<void> {
  const [existing] = await db
    .select({ id: organizationSettings.id })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        eq(organizationSettings.key, key),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(organizationSettings)
      .set({ value })
      .where(eq(organizationSettings.id, existing.id));
    return;
  }

  await db.insert(organizationSettings).values({
    organizationId,
    key,
    value,
  });
}
