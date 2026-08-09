import { sql } from 'drizzle-orm';
import { PERMISSION_CATALOG } from '@/shared/permissions/catalog';
import type { DbExecutor } from '@/shared/db/types';
import { permissions, taxRules } from '@drizzle/schema';

/**
 * System seed (doc 77 §4).
 *
 * Deterministic and idempotent — safe to run on every environment including
 * production. Contains reference data only: no demo organizations, projects or
 * expenses.
 */

/**
 * Israel country pack baseline (doc 11).
 *
 * Effective-dated rather than a constant, so historical documents keep the rate
 * that applied when they were issued. `organization_id IS NULL` marks these as
 * shared reference rules that an organization may override.
 */
const ISRAEL_VAT_RULES = [
  { key: 'il_vat_standard_2015', name: 'VAT (Israel) 17%', ratePercent: '17', validFrom: '2015-10-01', validTo: '2024-12-31' },
  { key: 'il_vat_standard_2025', name: 'VAT (Israel) 18%', ratePercent: '18', validFrom: '2025-01-01', validTo: null },
] as const;

export async function seedSystemData(db: DbExecutor): Promise<{ permissions: number; taxRules: number }> {
  await db
    .insert(permissions)
    .values(
      PERMISSION_CATALOG.map((permission) => ({
        key: permission.key,
        category: permission.category,
        description: permission.description,
      })),
    )
    .onConflictDoUpdate({
      target: permissions.key,
      set: {
        category: sql`excluded.category`,
        description: sql`excluded.description`,
      },
    });

  for (const rule of ISRAEL_VAT_RULES) {
    await db
      .insert(taxRules)
      .values({
        organizationId: null,
        countryCode: 'IL',
        key: rule.key,
        name: rule.name,
        method: 'percentage',
        ratePercent: rule.ratePercent,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
        isDefault: true,
      })
      .onConflictDoNothing({
        target: [taxRules.countryCode, taxRules.key],
        where: sql`organization_id is null`,
      });
  }

  return { permissions: PERMISSION_CATALOG.length, taxRules: ISRAEL_VAT_RULES.length };
}
