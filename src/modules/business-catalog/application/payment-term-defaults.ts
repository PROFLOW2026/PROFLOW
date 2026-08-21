import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '@/modules/tenancy';
import { getCatalogEntryById, getCatalogEntryByKey } from '../data/catalog.repository';
import {
  parsePaymentTermMetadata,
  type PaymentTermMetadata,
} from '../domain/types';

/** Organization setting key — JSON string catalog key (e.g. `"net_30"`). Seeded by migration 0060. */
export const DEFAULT_PAYMENT_TERM_KEY_SETTING = 'default_payment_term_key';

/** Catalog key written when org default is unset (matches migration 0060 seed). */
export const DEFAULT_PAYMENT_TERM_CATALOG_KEY = 'net_30';

export function parseOrgDefaultPaymentTermKey(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export async function getOrgDefaultPaymentTermKey(
  db: DbExecutor,
  organizationId: string,
): Promise<string | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    DEFAULT_PAYMENT_TERM_KEY_SETTING,
  );
  return parseOrgDefaultPaymentTermKey(raw);
}

export async function resolveOrgDefaultPaymentTermId(
  db: DbExecutor,
  organizationId: string,
): Promise<string | null> {
  const key = await getOrgDefaultPaymentTermKey(db, organizationId);
  if (!key) return null;
  const entry = await getCatalogEntryByKey(db, organizationId, 'payment_term', key);
  if (!entry || !entry.isActive || entry.archivedAt) return null;
  return entry.id;
}

export async function resolveOrgDefaultPaymentTermIdForContext(
  context: OrgContext,
): Promise<string | null> {
  return resolveOrgDefaultPaymentTermId(context.db, context.organizationId);
}

export async function setOrgDefaultPaymentTermKey(
  context: OrgContext,
  catalogKey: string,
): Promise<void> {
  const trimmed = catalogKey.trim();
  if (!trimmed) {
    throw new Error('Payment term key is required');
  }
  const entry = await getCatalogEntryByKey(
    context.db,
    context.organizationId,
    'payment_term',
    trimmed,
  );
  if (!entry || !entry.isActive || entry.archivedAt) {
    throw new Error('Payment term not found');
  }
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    DEFAULT_PAYMENT_TERM_KEY_SETTING,
    trimmed,
  );
}

export async function loadActivePaymentTermMetadata(
  db: DbExecutor,
  organizationId: string,
  paymentTermId: string | null | undefined,
): Promise<PaymentTermMetadata | null> {
  if (!paymentTermId) return null;
  const entry = await getCatalogEntryById(db, organizationId, paymentTermId);
  if (!entry || entry.kind !== 'payment_term' || !entry.isActive || entry.archivedAt) {
    return null;
  }
  return parsePaymentTermMetadata(entry.metadata);
}

/**
 * Sets org default payment term catalog key when missing.
 * Never overwrites an existing value (same policy as migration 0060).
 * Call after `seedUniversalBusinessCatalogs` so the catalog entry exists.
 */
export async function ensureOrgDefaultPaymentTermKey(
  db: DbExecutor,
  organizationId: string,
): Promise<void> {
  const existing = await getOrgDefaultPaymentTermKey(db, organizationId);
  if (existing) return;
  await upsertOrganizationSettingValue(
    db,
    organizationId,
    DEFAULT_PAYMENT_TERM_KEY_SETTING,
    DEFAULT_PAYMENT_TERM_CATALOG_KEY,
  );
}
