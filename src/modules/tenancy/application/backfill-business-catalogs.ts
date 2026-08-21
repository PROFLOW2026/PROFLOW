import { organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { seedUniversalBusinessCatalogs } from '@/modules/business-catalog/application/seed-catalog';
import {
  DEFAULT_PAYMENT_TERM_KEY_SETTING,
  getOrgDefaultPaymentTermKey,
} from '@/modules/business-catalog/application/payment-term-defaults';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  BUSINESS_PROFILE_SETTING_KEY,
  isBusinessProfileKey,
  type BusinessProfileKey,
} from '../domain/business-profiles';
import { applyBusinessProfileConfig } from './apply-business-profile';

/**
 * Idempotent existing-org catalog backfill (application-side companion to 0060 SQL seed).
 *
 * - Universal catalogs: insert missing keys only (never overwrite names/metadata).
 * - Org default payment term key: set to net_30 only when unset.
 * - Profile vocabulary: if org already has a business_profile setting, re-seed
 *   profile catalogs only (`catalogsOnly`). Does NOT change the profile itself
 *   and does NOT require Owner to re-pick a profile.
 *
 * Safe to re-run. Prefer after migrations on disposable/local DBs and once
 * post-Owner-apply for production orgs.
 */
export async function backfillExistingOrgBusinessCatalogs(
  db: DbExecutor,
  options: { readonly organizationIds?: readonly string[] } = {},
): Promise<{ readonly organizationsProcessed: number }> {
  const rows = options.organizationIds?.length
    ? options.organizationIds.map((id) => ({ id }))
    : await db.select({ id: organizations.id }).from(organizations);

  let processed = 0;
  for (const org of rows) {
    await seedUniversalBusinessCatalogs(db, org.id);

    const existingKey = await getOrgDefaultPaymentTermKey(db, org.id);
    if (!existingKey) {
      await upsertOrganizationSettingValue(
        db,
        org.id,
        DEFAULT_PAYMENT_TERM_KEY_SETTING,
        'net_30',
      );
    }

    const profileRaw = await getOrganizationSettingValue<unknown>(
      db,
      org.id,
      BUSINESS_PROFILE_SETTING_KEY,
    );
    const profileKey =
      typeof profileRaw === 'string' && isBusinessProfileKey(profileRaw)
        ? profileRaw
        : null;

    if (profileKey) {
      await applyBusinessProfileConfig(db, org.id, profileKey as BusinessProfileKey, 'en', {
        catalogsOnly: true,
      });
    }

    processed += 1;
  }

  return { organizationsProcessed: processed };
}

/** Convenience for single-org ensure after create or settings open. */
export async function ensureOrgBusinessCatalogDefaults(
  db: DbExecutor,
  organizationId: string,
): Promise<void> {
  await backfillExistingOrgBusinessCatalogs(db, { organizationIds: [organizationId] });
}
