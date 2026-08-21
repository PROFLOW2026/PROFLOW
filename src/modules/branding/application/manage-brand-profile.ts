import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertVisibleBrandColor } from '../domain/colors';
import { sanitizeOptionalBrandText } from '../domain/sanitize-text';
import {
  clearOtherDefaultBrandProfiles,
  findBrandProfileById,
  findDefaultBrandProfile,
  insertBrandProfile,
  listBrandProfiles,
  updateBrandProfile,
} from '../data/brand-profile.repository';
import type { BrandProfile } from '../domain/types';
import { ensureDefaultBranding } from './ensure-default-branding';
import {
  upsertBrandProfileSchema,
  type UpsertBrandProfileInput,
} from '../validation/schemas';

export async function listOrganizationBrandProfiles(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ORG_READ);
  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });
  return listBrandProfiles(context.db, context.organizationId);
}

export async function getDefaultBrandProfile(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ORG_READ);
  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });
  return findDefaultBrandProfile(context.db, context.organizationId);
}

/**
 * Invariant: whenever any active brand profiles exist, exactly one is default.
 * Soft-archive only — hard delete blocked by FK RESTRICT + archive policy.
 * Default swap: clear others then set (partial unique index enforces one default).
 */
export async function upsertOrganizationBrandProfile(
  context: OrgContext,
  raw: UpsertBrandProfileInput,
): Promise<BrandProfile> {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const parsed = upsertBrandProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  await ensureDefaultBranding(context.db, context.organizationId, {
    name: context.organization.name,
    countryCode: context.organization.countryCode,
  });

  const primaryColor = input.primaryColor
    ? assertVisibleBrandColor(input.primaryColor, 'primaryColor')
    : undefined;
  const secondaryColor = input.secondaryColor
    ? assertVisibleBrandColor(input.secondaryColor, 'secondaryColor')
    : undefined;

  const textPatch = {
    footerCustomText: sanitizeOptionalBrandText(input.footerCustomText),
    quoteFooterText: sanitizeOptionalBrandText(input.quoteFooterText),
    quoteTermsText: sanitizeOptionalBrandText(input.quoteTermsText),
    reportFooterText: sanitizeOptionalBrandText(input.reportFooterText),
    paymentInstructionsText: sanitizeOptionalBrandText(input.paymentInstructionsText),
    generalDocumentNote: sanitizeOptionalBrandText(input.generalDocumentNote),
    emailSignatureText: sanitizeOptionalBrandText(input.emailSignatureText),
    poTermsText: sanitizeOptionalBrandText(input.poTermsText),
    serviceReportNote: sanitizeOptionalBrandText(input.serviceReportNote),
    reportDisclaimerText: sanitizeOptionalBrandText(input.reportDisclaimerText),
  };

  if (input.brandProfileId) {
    const before = await findBrandProfileById(
      context.db,
      context.organizationId,
      input.brandProfileId,
    );
    if (!before || before.status === 'archived') {
      throw new NotFoundError('Brand profile');
    }

    if (input.setAsDefault) {
      await clearOtherDefaultBrandProfiles(context.db, context.organizationId, input.brandProfileId);
    }

    const after = await updateBrandProfile(context.db, context.organizationId, input.brandProfileId, {
      name: input.name,
      primaryColor,
      secondaryColor,
      headerLayout: input.headerLayout,
      footerStyle: input.footerStyle,
      documentTheme: input.documentTheme,
      templatePreset: input.templatePreset,
      showLogo: input.showLogo,
      showLegalName: input.showLegalName,
      showDisplayName: input.showDisplayName,
      showRegistrationNumber: input.showRegistrationNumber,
      showVatTaxId: input.showVatTaxId,
      showAddress: input.showAddress,
      showPhone: input.showPhone,
      showEmail: input.showEmail,
      showWebsite: input.showWebsite,
      showPageNumbers: input.showPageNumbers,
      showGeneratedDate: input.showGeneratedDate,
      showDocumentReference: input.showDocumentReference,
      allowSignatureOnQuotes: input.allowSignatureOnQuotes,
      allowSignatureOnReports: input.allowSignatureOnReports,
      allowStamp: input.allowStamp,
      includeSignatureByDefault: input.includeSignatureByDefault,
      includeStampByDefault: input.includeStampByDefault,
      ...textPatch,
      isDefault: input.setAsDefault ? true : undefined,
    });
    if (!after) throw new NotFoundError('Brand profile');

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.BRAND_PROFILE_UPDATED,
      entityType: 'organization_brand_profile',
      entityId: after.id,
      before,
      after,
    });
    return after;
  }

  const created = await insertBrandProfile(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    isDefault: false,
    primaryColor,
    secondaryColor,
    headerLayout: input.headerLayout,
    footerStyle: input.footerStyle,
    documentTheme: input.documentTheme,
    templatePreset: input.templatePreset,
  });

  if (input.setAsDefault) {
    await clearOtherDefaultBrandProfiles(context.db, context.organizationId, created.id);
    await updateBrandProfile(context.db, context.organizationId, created.id, { isDefault: true });
  }

  const after =
    (await updateBrandProfile(context.db, context.organizationId, created.id, {
      showLogo: input.showLogo,
      showLegalName: input.showLegalName,
      showDisplayName: input.showDisplayName,
      showRegistrationNumber: input.showRegistrationNumber,
      showVatTaxId: input.showVatTaxId,
      showAddress: input.showAddress,
      showPhone: input.showPhone,
      showEmail: input.showEmail,
      showWebsite: input.showWebsite,
      showPageNumbers: input.showPageNumbers,
      showGeneratedDate: input.showGeneratedDate,
      showDocumentReference: input.showDocumentReference,
      allowSignatureOnQuotes: input.allowSignatureOnQuotes,
      allowSignatureOnReports: input.allowSignatureOnReports,
      allowStamp: input.allowStamp,
      includeSignatureByDefault: input.includeSignatureByDefault,
      includeStampByDefault: input.includeStampByDefault,
      ...textPatch,
    })) ?? created;

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BRAND_PROFILE_CREATED,
    entityType: 'organization_brand_profile',
    entityId: after.id,
    after,
  });

  return after;
}

/** Default swap — clear previous defaults then set the new one (unique index guards). */
export async function setDefaultBrandProfile(
  context: OrgContext,
  brandProfileId: string,
): Promise<BrandProfile | null> {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const profile = await findBrandProfileById(context.db, context.organizationId, brandProfileId);
  if (!profile || profile.status !== 'active') {
    throw new NotFoundError('Brand profile');
  }

  await clearOtherDefaultBrandProfiles(context.db, context.organizationId, brandProfileId);
  const after = await updateBrandProfile(context.db, context.organizationId, brandProfileId, {
    isDefault: true,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BRAND_PROFILE_DEFAULT_SET,
    entityType: 'organization_brand_profile',
    entityId: brandProfileId,
    after,
  });
  return after;
}

/**
 * Soft-archive only. Cannot archive the default, and cannot leave the org
 * without an active default (set another default first).
 */
export async function archiveBrandProfile(context: OrgContext, brandProfileId: string) {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const profile = await findBrandProfileById(context.db, context.organizationId, brandProfileId);
  if (!profile) throw new NotFoundError('Brand profile');
  if (profile.isDefault) {
    throw new DomainRuleError(
      'Cannot archive the default brand profile. Set another default first.',
      'branding.errors.cannotArchiveDefault',
    );
  }

  const active = await listBrandProfiles(context.db, context.organizationId);
  if (active.length <= 1) {
    throw new DomainRuleError(
      'Cannot archive the last active brand profile. Create a replacement first.',
      'branding.errors.cannotArchiveLastActive',
    );
  }

  const defaultBrand = await findDefaultBrandProfile(context.db, context.organizationId);
  if (!defaultBrand || defaultBrand.id === brandProfileId) {
    throw new DomainRuleError(
      'Cannot archive without an alternate active default brand.',
      'branding.errors.cannotArchiveDefault',
    );
  }

  const after = await updateBrandProfile(context.db, context.organizationId, brandProfileId, {
    status: 'archived',
    archivedAt: new Date(),
    isDefault: false,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BRAND_PROFILE_ARCHIVED,
    entityType: 'organization_brand_profile',
    entityId: brandProfileId,
    before: profile,
    after,
  });
  return after;
}
