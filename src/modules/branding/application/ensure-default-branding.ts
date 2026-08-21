import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import {
  findCompanyProfileByOrg,
  insertCompanyProfile,
} from '../data/company-profile.repository';
import {
  findDefaultBrandProfile,
  insertDefaultBrandProfile,
} from '../data/brand-profile.repository';
import type { BrandProfile, CompanyProfile } from '../domain/types';

export interface EnsureDefaultBrandingSeed {
  readonly name: string;
  readonly countryCode?: string | null;
  readonly registrationNumber?: string | null;
  readonly vatTaxId?: string | null;
}

export interface EnsureDefaultBrandingResult {
  readonly company: CompanyProfile;
  readonly brand: BrandProfile;
  readonly createdCompany: boolean;
  readonly createdBrand: boolean;
}

/**
 * Idempotent seed of company profile + default brand.
 * Signature: (db, organizationId, seed) — used by org create and settings.
 */
export async function ensureDefaultBranding(
  db: DbExecutor,
  organizationId: string,
  seed: EnsureDefaultBrandingSeed,
): Promise<EnsureDefaultBrandingResult> {
  let createdCompany = false;
  let company = await findCompanyProfileByOrg(db, organizationId);
  if (!company) {
    company = await insertCompanyProfile(db, {
      organizationId,
      legalName: seed.name,
      displayName: seed.name,
      countryCode: seed.countryCode ?? null,
      registrationNumber: seed.registrationNumber ?? null,
      vatTaxId: seed.vatTaxId ?? null,
    });
    createdCompany = true;
  }

  let createdBrand = false;
  let brand = await findDefaultBrandProfile(db, organizationId);
  if (!brand) {
    brand = await insertDefaultBrandProfile(db, {
      organizationId,
      name: 'Default',
    });
    createdBrand = true;
  }

  return { company, brand, createdCompany, createdBrand };
}

/** Alias used by repositories / manage modules. */
export async function ensureDefaultBrandProfileRow(
  db: DbExecutor,
  organizationId: string,
  name = 'Default',
): Promise<BrandProfile> {
  const existing = await findDefaultBrandProfile(db, organizationId);
  if (existing) return existing;
  return insertDefaultBrandProfile(db, { organizationId, name });
}
