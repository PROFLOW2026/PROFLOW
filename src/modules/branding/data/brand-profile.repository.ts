import 'server-only';

import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { organizationBrandProfiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BrandProfile,
  BrandProfileStatus,
  DocumentTheme,
  FooterStyle,
  HeaderLayout,
  TemplatePreset,
} from '../domain/types';

function mapRow(row: typeof organizationBrandProfiles.$inferSelect): BrandProfile {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    isDefault: row.isDefault,
    status: row.status as BrandProfileStatus,
    logoPrimaryKey: row.logoPrimaryKey ?? null,
    logoPrimaryContentType: row.logoPrimaryContentType ?? null,
    logoPrimaryByteSize: row.logoPrimaryByteSize ?? null,
    logoPrimaryWidth: row.logoPrimaryWidth ?? null,
    logoPrimaryHeight: row.logoPrimaryHeight ?? null,
    logoCompactKey: row.logoCompactKey ?? null,
    logoCompactContentType: row.logoCompactContentType ?? null,
    logoDarkKey: row.logoDarkKey ?? null,
    logoDarkContentType: row.logoDarkContentType ?? null,
    logoLightKey: row.logoLightKey ?? null,
    logoLightContentType: row.logoLightContentType ?? null,
    signatureImageKey: row.signatureImageKey ?? null,
    signatureImageContentType: row.signatureImageContentType ?? null,
    stampImageKey: row.stampImageKey ?? null,
    stampImageContentType: row.stampImageContentType ?? null,
    primaryColor: row.primaryColor,
    secondaryColor: row.secondaryColor,
    headerLayout: row.headerLayout as HeaderLayout,
    footerStyle: row.footerStyle as FooterStyle,
    documentTheme: row.documentTheme as DocumentTheme,
    templatePreset: row.templatePreset as TemplatePreset,
    showLogo: row.showLogo,
    showLegalName: row.showLegalName,
    showDisplayName: row.showDisplayName,
    showRegistrationNumber: row.showRegistrationNumber,
    showVatTaxId: row.showVatTaxId,
    showAddress: row.showAddress,
    showPhone: row.showPhone,
    showEmail: row.showEmail,
    showWebsite: row.showWebsite,
    showPageNumbers: row.showPageNumbers,
    showGeneratedDate: row.showGeneratedDate,
    showDocumentReference: row.showDocumentReference,
    allowSignatureOnQuotes: row.allowSignatureOnQuotes,
    allowSignatureOnReports: row.allowSignatureOnReports,
    allowStamp: row.allowStamp,
    includeSignatureByDefault: row.includeSignatureByDefault,
    includeStampByDefault: row.includeStampByDefault,
    footerCustomText: row.footerCustomText ?? null,
    quoteFooterText: row.quoteFooterText ?? null,
    quoteTermsText: row.quoteTermsText ?? null,
    reportFooterText: row.reportFooterText ?? null,
    paymentInstructionsText: row.paymentInstructionsText ?? null,
    generalDocumentNote: row.generalDocumentNote ?? null,
    emailSignatureText: row.emailSignatureText ?? null,
    poTermsText: row.poTermsText ?? null,
    serviceReportNote: row.serviceReportNote ?? null,
    reportDisclaimerText: row.reportDisclaimerText ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findDefaultBrandProfile(
  db: DbExecutor,
  organizationId: string,
): Promise<BrandProfile | null> {
  const [row] = await db
    .select()
    .from(organizationBrandProfiles)
    .where(
      and(
        eq(organizationBrandProfiles.organizationId, organizationId),
        eq(organizationBrandProfiles.isDefault, true),
        eq(organizationBrandProfiles.status, 'active'),
        isNull(organizationBrandProfiles.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/**
 * Org-scoped lookup — never returns a brand belonging to another organization.
 */
export async function findBrandProfileById(
  db: DbExecutor,
  organizationId: string,
  brandProfileId: string,
): Promise<BrandProfile | null> {
  return findBrandProfileByIdForOrg(db, organizationId, brandProfileId);
}

export async function findBrandProfileByIdForOrg(
  db: DbExecutor,
  organizationId: string,
  brandProfileId: string,
): Promise<BrandProfile | null> {
  const [row] = await db
    .select()
    .from(organizationBrandProfiles)
    .where(
      and(
        eq(organizationBrandProfiles.id, brandProfileId),
        eq(organizationBrandProfiles.organizationId, organizationId),
        isNull(organizationBrandProfiles.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function listBrandProfilesForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<BrandProfile[]> {
  const rows = await db
    .select()
    .from(organizationBrandProfiles)
    .where(
      and(
        eq(organizationBrandProfiles.organizationId, organizationId),
        isNull(organizationBrandProfiles.archivedAt),
      ),
    )
    .orderBy(asc(organizationBrandProfiles.name));
  return rows.map(mapRow);
}

export async function insertDefaultBrandProfile(
  db: DbExecutor,
  values: { organizationId: string; name?: string },
): Promise<BrandProfile> {
  const [row] = await db
    .insert(organizationBrandProfiles)
    .values({
      organizationId: values.organizationId,
      name: values.name ?? 'Default',
      isDefault: true,
      status: 'active',
    })
    .returning();
  return mapRow(row!);
}

export async function listBrandProfiles(
  db: DbExecutor,
  organizationId: string,
  options: { includeArchived?: boolean } = {},
): Promise<BrandProfile[]> {
  if (options.includeArchived) {
    const rows = await db
      .select()
      .from(organizationBrandProfiles)
      .where(eq(organizationBrandProfiles.organizationId, organizationId))
      .orderBy(asc(organizationBrandProfiles.name));
    return rows.map(mapRow);
  }
  return listBrandProfilesForOrg(db, organizationId);
}

export interface BrandProfileInsert {
  readonly organizationId: string;
  readonly name: string;
  readonly isDefault?: boolean;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly headerLayout?: HeaderLayout;
  readonly footerStyle?: FooterStyle;
  readonly documentTheme?: DocumentTheme;
  readonly templatePreset?: TemplatePreset;
}

export async function insertBrandProfile(
  db: DbExecutor,
  input: BrandProfileInsert,
): Promise<BrandProfile> {
  const [row] = await db
    .insert(organizationBrandProfiles)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      isDefault: input.isDefault ?? false,
      status: 'active',
      primaryColor: input.primaryColor,
      secondaryColor: input.secondaryColor,
      headerLayout: input.headerLayout,
      footerStyle: input.footerStyle,
      documentTheme: input.documentTheme,
      templatePreset: input.templatePreset,
    })
    .returning();
  return mapRow(row!);
}

export type BrandProfilePatch = Partial<{
  name: string;
  primaryColor: string;
  secondaryColor: string;
  headerLayout: HeaderLayout;
  footerStyle: FooterStyle;
  documentTheme: DocumentTheme;
  templatePreset: TemplatePreset;
  showLogo: boolean;
  showLegalName: boolean;
  showDisplayName: boolean;
  showRegistrationNumber: boolean;
  showVatTaxId: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showPageNumbers: boolean;
  showGeneratedDate: boolean;
  showDocumentReference: boolean;
  allowSignatureOnQuotes: boolean;
  allowSignatureOnReports: boolean;
  allowStamp: boolean;
  includeSignatureByDefault: boolean;
  includeStampByDefault: boolean;
  footerCustomText: string | null;
  quoteFooterText: string | null;
  quoteTermsText: string | null;
  reportFooterText: string | null;
  paymentInstructionsText: string | null;
  generalDocumentNote: string | null;
  emailSignatureText: string | null;
  poTermsText: string | null;
  serviceReportNote: string | null;
  reportDisclaimerText: string | null;
  logoPrimaryKey: string | null;
  logoPrimaryContentType: string | null;
  logoPrimaryByteSize: number | null;
  logoPrimaryWidth: number | null;
  logoPrimaryHeight: number | null;
  logoCompactKey: string | null;
  logoCompactContentType: string | null;
  logoDarkKey: string | null;
  logoDarkContentType: string | null;
  logoLightKey: string | null;
  logoLightContentType: string | null;
  signatureImageKey: string | null;
  signatureImageContentType: string | null;
  stampImageKey: string | null;
  stampImageContentType: string | null;
  isDefault: boolean;
  status: BrandProfileStatus;
  archivedAt: Date | null;
}>;

export async function updateBrandProfile(
  db: DbExecutor,
  organizationId: string,
  brandProfileId: string,
  patch: BrandProfilePatch,
): Promise<BrandProfile | null> {
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) values[key] = value;
  }
  if (Object.keys(values).length === 0) {
    return findBrandProfileById(db, organizationId, brandProfileId);
  }

  const [row] = await db
    .update(organizationBrandProfiles)
    .set(values)
    .where(
      and(
        eq(organizationBrandProfiles.id, brandProfileId),
        eq(organizationBrandProfiles.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function clearOtherDefaultBrandProfiles(
  db: DbExecutor,
  organizationId: string,
  keepBrandProfileId: string,
): Promise<void> {
  await db
    .update(organizationBrandProfiles)
    .set({ isDefault: false })
    .where(
      and(
        eq(organizationBrandProfiles.organizationId, organizationId),
        eq(organizationBrandProfiles.isDefault, true),
        ne(organizationBrandProfiles.id, keepBrandProfileId),
      ),
    );
}

export async function ensureDefaultBrandProfileRow(
  db: DbExecutor,
  organizationId: string,
  name = 'Default',
): Promise<BrandProfile> {
  const existing = await findDefaultBrandProfile(db, organizationId);
  if (existing) return existing;
  return insertDefaultBrandProfile(db, { organizationId, name });
}
