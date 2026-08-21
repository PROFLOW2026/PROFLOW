import 'server-only';

import { eq } from 'drizzle-orm';
import { organizationCompanyProfiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { CompanyProfile, ExtraIdentifier } from '../domain/types';

function mapExtraIdentifiers(raw: unknown): ExtraIdentifier[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraIdentifier[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const label = typeof (item as { label?: unknown }).label === 'string'
      ? (item as { label: string }).label.trim()
      : '';
    const value = typeof (item as { value?: unknown }).value === 'string'
      ? (item as { value: string }).value.trim()
      : '';
    if (label && value) out.push({ label, value });
  }
  return out;
}

function mapRow(row: typeof organizationCompanyProfiles.$inferSelect): CompanyProfile {
  return {
    id: row.id,
    organizationId: row.organizationId,
    legalName: row.legalName,
    displayName: row.displayName,
    tradingName: row.tradingName ?? null,
    registrationNumber: row.registrationNumber ?? null,
    vatTaxId: row.vatTaxId ?? null,
    extraIdentifiers: mapExtraIdentifiers(row.extraIdentifiers),
    website: row.website ?? null,
    mainEmail: row.mainEmail ?? null,
    mainPhone: row.mainPhone ?? null,
    secondaryPhone: row.secondaryPhone ?? null,
    whatsappPhone: row.whatsappPhone ?? null,
    billingEmail: row.billingEmail ?? null,
    salesEmail: row.salesEmail ?? null,
    supportEmail: row.supportEmail ?? null,
    addressLine1: row.addressLine1 ?? null,
    addressLine2: row.addressLine2 ?? null,
    city: row.city ?? null,
    region: row.region ?? null,
    postalCode: row.postalCode ?? null,
    countryCode: row.countryCode ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findCompanyProfileByOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<CompanyProfile | null> {
  const [row] = await db
    .select()
    .from(organizationCompanyProfiles)
    .where(eq(organizationCompanyProfiles.organizationId, organizationId))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function insertCompanyProfile(
  db: DbExecutor,
  values: {
    organizationId: string;
    legalName: string;
    displayName: string;
    tradingName?: string | null;
    registrationNumber?: string | null;
    vatTaxId?: string | null;
    countryCode?: string | null;
    website?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
  },
): Promise<CompanyProfile> {
  const [row] = await db
    .insert(organizationCompanyProfiles)
    .values({
      organizationId: values.organizationId,
      legalName: values.legalName,
      displayName: values.displayName,
      tradingName: values.tradingName ?? null,
      registrationNumber: values.registrationNumber ?? null,
      vatTaxId: values.vatTaxId ?? null,
      countryCode: values.countryCode ?? null,
      website: values.website ?? null,
      mainEmail: values.mainEmail ?? null,
      mainPhone: values.mainPhone ?? null,
    })
    .returning();
  return mapRow(row!);
}

export type CompanyProfilePatch = Partial<{
  legalName: string;
  displayName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatTaxId: string | null;
  extraIdentifiers: readonly ExtraIdentifier[];
  website: string | null;
  mainEmail: string | null;
  mainPhone: string | null;
  secondaryPhone: string | null;
  whatsappPhone: string | null;
  billingEmail: string | null;
  salesEmail: string | null;
  supportEmail: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
}>;

export async function updateCompanyProfile(
  db: DbExecutor,
  organizationId: string,
  patch: CompanyProfilePatch,
): Promise<CompanyProfile | null> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) values[key] = value;
  }
  if (Object.keys(values).length === 0) {
    return findCompanyProfileByOrg(db, organizationId);
  }
  const [row] = await db
    .update(organizationCompanyProfiles)
    .set(values)
    .where(eq(organizationCompanyProfiles.organizationId, organizationId))
    .returning();
  return row ? mapRow(row) : null;
}
