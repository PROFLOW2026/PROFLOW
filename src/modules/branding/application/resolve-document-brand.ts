import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { localeDirection } from '@/shared/i18n/config';
import { findBrandSnapshot } from '../data/brand-snapshots.repository';
import {
  documentBrandFromSnapshot,
  minimalBrandContext,
  type DocumentBrandContext,
} from '../domain/document-brand';
import type { BrandSnapshot, DocumentTheme } from '../domain/types';
import {
  resolveDocumentBrandSchema,
  type ResolveDocumentBrandInput,
} from '../validation/schemas';
import { buildLiveBrandSnapshot } from './capture-brand-snapshot';

export interface ResolveDocumentBrandResult {
  readonly source: 'snapshot' | 'live';
  readonly snapshot: BrandSnapshot;
  readonly context: DocumentBrandContext;
}

function applyTheme(brand: DocumentBrandContext, theme?: DocumentTheme | null): DocumentBrandContext {
  if (!theme) return brand;
  return { ...brand, theme };
}

/**
 * For issued/final documents: return frozen snapshot when present.
 * For drafts / reports: resolve live org default → project → document override.
 * No ORG_READ gate — callers are already authorized for the document/report.
 */
export async function resolveDocumentBrand(
  context: OrgContext,
  rawInput: ResolveDocumentBrandInput = {},
): Promise<ResolveDocumentBrandResult> {
  const parsed = resolveDocumentBrandSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const locale = input.locale ?? context.locale ?? context.organization.defaultLocale ?? 'he-IL';
  const dir = input.dir ?? localeDirection(locale);

  try {
    const preferSnapshot = input.useSnapshotIfPresent !== false;
    if (preferSnapshot && input.entityType && input.entityId) {
      const frozen = await findBrandSnapshot(
        context.db,
        context.organizationId,
        input.entityType,
        input.entityId,
      );
      if (frozen) {
        return {
          source: 'snapshot',
          snapshot: frozen.snapshot,
          context: applyTheme(
            documentBrandFromSnapshot(frozen.snapshot, locale, dir),
            input.theme,
          ),
        };
      }
    }

    const snapshot = await buildLiveBrandSnapshot(context, {
      projectId: input.projectId,
      brandProfileId: input.brandProfileId,
    });

    return {
      source: 'live',
      snapshot,
      context: applyTheme(documentBrandFromSnapshot(snapshot, locale, dir), input.theme),
    };
  } catch (error) {
    if (error instanceof DomainRuleError || error instanceof ValidationError) throw error;
    const fallback = minimalBrandContext(
      context.organization.name,
      locale,
      dir,
      input.theme ?? 'customer',
    );
    return {
      source: 'live',
      snapshot: {
        version: 1,
        brandProfileId: null,
        brandProfileName: null,
        companyLegalName: context.organization.name,
        companyDisplayName: context.organization.name,
        tradingName: null,
        registrationNumber: null,
        vatTaxId: null,
        addressLines: [],
        phones: [],
        emails: [],
        website: null,
        primaryColor: '#0F766E',
        secondaryColor: '#334155',
        headerLayout: 'letterhead',
        footerStyle: 'detailed',
        documentTheme: input.theme ?? 'customer',
        templatePreset: 'standard',
        showLogo: true,
        showLegalName: true,
        showDisplayName: true,
        showRegistrationNumber: true,
        showVatTaxId: true,
        showAddress: true,
        showPhone: true,
        showEmail: true,
        showWebsite: true,
        showPageNumbers: true,
        showGeneratedDate: true,
        showDocumentReference: true,
        allowSignatureOnQuotes: false,
        allowSignatureOnReports: false,
        allowStamp: false,
        includeSignatureByDefault: false,
        includeStampByDefault: false,
        logoPrimaryKey: null,
        logoPrimaryContentType: null,
        logoDarkKey: null,
        logoDarkContentType: null,
        logoCompactKey: null,
        logoCompactContentType: null,
        logoLightKey: null,
        logoLightContentType: null,
        signatureImageKey: null,
        signatureImageContentType: null,
        stampImageKey: null,
        stampImageContentType: null,
        footerCustomText: null,
        quoteFooterText: null,
        quoteTermsText: null,
        reportFooterText: null,
        paymentInstructionsText: null,
        generalDocumentNote: null,
        emailSignatureText: null,
        poTermsText: null,
        serviceReportNote: null,
        reportDisclaimerText: null,
        capturedAt: new Date().toISOString(),
      },
      context: fallback,
    };
  }
}
