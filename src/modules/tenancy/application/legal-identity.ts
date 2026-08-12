import type { DbExecutor } from '@/shared/db/types';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  LEGAL_IDENTITY_SETTING_KEY,
  parseOrganizationLegalIdentity,
  resolveOrganizationTaxId,
  type OrganizationLegalIdentity,
} from '../domain/legal-identity';

export async function getOrganizationLegalIdentity(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationLegalIdentity> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    LEGAL_IDENTITY_SETTING_KEY,
  );
  return parseOrganizationLegalIdentity(raw);
}

export async function getOrganizationTaxId(
  db: DbExecutor,
  organizationId: string,
): Promise<string | null> {
  return resolveOrganizationTaxId(await getOrganizationLegalIdentity(db, organizationId));
}

export async function saveOrganizationLegalIdentity(
  db: DbExecutor,
  organizationId: string,
  identity: { taxId?: string | null; companyNumber?: string | null },
): Promise<OrganizationLegalIdentity> {
  const next = parseOrganizationLegalIdentity({
    taxId: identity.taxId ?? null,
    companyNumber: identity.companyNumber ?? null,
  });
  await upsertOrganizationSettingValue(db, organizationId, LEGAL_IDENTITY_SETTING_KEY, next);
  return next;
}
