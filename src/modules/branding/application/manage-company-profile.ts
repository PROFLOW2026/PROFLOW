import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findCompanyProfileByOrg,
  updateCompanyProfile as patchCompanyProfile,
  type CompanyProfilePatch,
} from '../data/company-profile.repository';
import type { CompanyProfile } from '../domain/types';
import { ensureDefaultBranding } from './ensure-default-branding';
import {
  updateCompanyProfileSchema,
  type UpdateCompanyProfileInput,
} from '../validation/schemas';

function emptyToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function getCompanyProfile(context: OrgContext): Promise<CompanyProfile> {
  assertPermission(context, PERMISSIONS.ORG_READ);
  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });
  const profile = await findCompanyProfileByOrg(context.db, context.organizationId);
  if (!profile) throw new NotFoundError('Company profile');
  return profile;
}

/** @deprecated Prefer getCompanyProfile */
export const getCompanyProfileForOrg = getCompanyProfile;

export async function updateCompanyProfile(
  context: OrgContext,
  raw: UpdateCompanyProfileInput,
): Promise<CompanyProfile> {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const parsed = updateCompanyProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });

  const before = await findCompanyProfileByOrg(context.db, context.organizationId);
  if (!before) throw new NotFoundError('Company profile');

  const input = parsed.data;
  const patch: CompanyProfilePatch = {
    legalName: input.legalName,
    displayName: input.displayName,
    tradingName: emptyToNull(input.tradingName),
    registrationNumber: emptyToNull(input.registrationNumber),
    vatTaxId: emptyToNull(input.vatTaxId),
    extraIdentifiers: input.extraIdentifiers,
    website: emptyToNull(input.website),
    mainEmail: emptyToNull(input.mainEmail),
    mainPhone: emptyToNull(input.mainPhone),
    secondaryPhone: emptyToNull(input.secondaryPhone),
    whatsappPhone: emptyToNull(input.whatsappPhone),
    billingEmail: emptyToNull(input.billingEmail),
    salesEmail: emptyToNull(input.salesEmail),
    supportEmail: emptyToNull(input.supportEmail),
    addressLine1: emptyToNull(input.addressLine1),
    addressLine2: emptyToNull(input.addressLine2),
    city: emptyToNull(input.city),
    region: emptyToNull(input.region),
    postalCode: emptyToNull(input.postalCode),
    countryCode:
      input.countryCode === undefined
        ? undefined
        : input.countryCode
          ? input.countryCode.toUpperCase()
          : null,
  };

  const after = await patchCompanyProfile(context.db, context.organizationId, patch);
  if (!after) throw new NotFoundError('Company profile');

  // organization_company_profiles is canonical Company Identity.
  // Keep legal_identity (OCR / legacy settings) in sync — never the reverse SoT.
  if (
    patch.registrationNumber !== undefined ||
    patch.vatTaxId !== undefined ||
    legalChanged(before, after)
  ) {
    const { saveOrganizationLegalIdentity } = await import(
      '@/modules/tenancy/application/legal-identity'
    );
    await saveOrganizationLegalIdentity(context.db, context.organizationId, {
      taxId: after.vatTaxId,
      companyNumber: after.registrationNumber,
    });
  }

  const legalFieldsChanged = legalChanged(before, after);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMPANY_PROFILE_UPDATED,
    entityType: 'organization_company_profile',
    entityId: after.id,
    before: {
      legalName: before.legalName,
      displayName: before.displayName,
      registrationNumber: before.registrationNumber,
      vatTaxId: before.vatTaxId,
    },
    after: {
      legalName: after.legalName,
      displayName: after.displayName,
      registrationNumber: after.registrationNumber,
      vatTaxId: after.vatTaxId,
    },
  });

  if (legalFieldsChanged) {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.BRAND_LEGAL_TEXT_CHANGED,
      entityType: 'organization_company_profile',
      entityId: after.id,
      after: {
        registrationNumber: after.registrationNumber,
        vatTaxId: after.vatTaxId,
        legalName: after.legalName,
      },
    });
  }

  return after;
}

function legalChanged(
  before: CompanyProfile,
  after: CompanyProfile,
): boolean {
  return (
    before.legalName !== after.legalName ||
    before.registrationNumber !== after.registrationNumber ||
    before.vatTaxId !== after.vatTaxId
  );
}

/** @deprecated Prefer updateCompanyProfile */
export const updateOrganizationCompanyProfile = updateCompanyProfile;
