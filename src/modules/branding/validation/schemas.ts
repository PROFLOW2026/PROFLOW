import { z } from 'zod';

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be #RRGGBB');

const optionalPlain = z.string().trim().max(8000).nullable().optional();
const optionalShort = z.string().trim().max(500).nullable().optional();
const optionalEmail = z
  .string()
  .trim()
  .email()
  .max(320)
  .nullable()
  .optional()
  .or(z.literal(''));
const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(500)
  .nullable()
  .optional()
  .or(z.literal(''));

const brandAssetKind = z.enum([
  'logo_primary',
  'logo_compact',
  'logo_dark',
  'logo_light',
  'signature',
  'stamp',
]);

const extraIdentifierSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(120),
});

export const updateCompanyProfileSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
  tradingName: optionalShort,
  registrationNumber: optionalShort,
  vatTaxId: optionalShort,
  extraIdentifiers: z.array(extraIdentifierSchema).max(20).optional(),
  website: optionalUrl,
  mainEmail: optionalEmail,
  mainPhone: optionalShort,
  secondaryPhone: optionalShort,
  whatsappPhone: optionalShort,
  billingEmail: optionalEmail,
  salesEmail: optionalEmail,
  supportEmail: optionalEmail,
  addressLine1: optionalShort,
  addressLine2: optionalShort,
  city: optionalShort,
  region: optionalShort,
  postalCode: optionalShort,
  countryCode: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .nullable()
    .optional(),
});

export type UpdateCompanyProfileInput = z.input<typeof updateCompanyProfileSchema>;

/** Create or update brand profile (upsert). */
export const upsertBrandProfileSchema = z.object({
  brandProfileId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  headerLayout: z.enum(['letterhead', 'logo_sides', 'centered', 'minimal']).optional(),
  footerStyle: z.enum(['minimal', 'detailed', 'legal']).optional(),
  documentTheme: z.enum(['customer', 'internal']).optional(),
  templatePreset: z.enum(['standard', 'minimal', 'formal', 'detailed']).optional(),
  showLogo: z.boolean().optional(),
  showLegalName: z.boolean().optional(),
  showDisplayName: z.boolean().optional(),
  showRegistrationNumber: z.boolean().optional(),
  showVatTaxId: z.boolean().optional(),
  showAddress: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showEmail: z.boolean().optional(),
  showWebsite: z.boolean().optional(),
  showPageNumbers: z.boolean().optional(),
  showGeneratedDate: z.boolean().optional(),
  showDocumentReference: z.boolean().optional(),
  allowSignatureOnQuotes: z.boolean().optional(),
  allowSignatureOnReports: z.boolean().optional(),
  allowStamp: z.boolean().optional(),
  includeSignatureByDefault: z.boolean().optional(),
  includeStampByDefault: z.boolean().optional(),
  footerCustomText: optionalPlain,
  quoteFooterText: optionalPlain,
  quoteTermsText: optionalPlain,
  reportFooterText: optionalPlain,
  paymentInstructionsText: optionalPlain,
  generalDocumentNote: optionalPlain,
  emailSignatureText: optionalPlain,
  poTermsText: optionalPlain,
  serviceReportNote: optionalPlain,
  reportDisclaimerText: optionalPlain,
  setAsDefault: z.boolean().optional(),
});

export type UpsertBrandProfileInput = z.input<typeof upsertBrandProfileSchema>;

export const createBrandProfileSchema = upsertBrandProfileSchema.omit({ brandProfileId: true });
export type CreateBrandProfileInput = z.input<typeof createBrandProfileSchema>;

export const updateBrandProfileSchema = upsertBrandProfileSchema.extend({
  brandProfileId: z.string().uuid(),
});
export type UpdateBrandProfileInput = z.input<typeof updateBrandProfileSchema>;

export const brandProfileIdSchema = z.object({
  brandProfileId: z.string().uuid(),
});

export const prepareBrandAssetUploadSchema = z.object({
  brandProfileId: z.string().uuid(),
  kind: brandAssetKind,
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().max(4000).nullable().optional(),
  height: z.number().int().positive().max(4000).nullable().optional(),
});

export type PrepareBrandAssetUploadInput = z.input<typeof prepareBrandAssetUploadSchema>;

export const confirmBrandAssetUploadSchema = z.object({
  brandProfileId: z.string().uuid(),
  kind: brandAssetKind,
  storageKey: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().max(4000).nullable().optional(),
  height: z.number().int().positive().max(4000).nullable().optional(),
});

export type ConfirmBrandAssetUploadInput = z.input<typeof confirmBrandAssetUploadSchema>;

export const removeBrandAssetSchema = z.object({
  brandProfileId: z.string().uuid(),
  kind: brandAssetKind,
});

export type RemoveBrandAssetInput = z.input<typeof removeBrandAssetSchema>;

/** Aliases for callers that use assetKind naming. */
export const prepareBrandAssetSchema = prepareBrandAssetUploadSchema;
export const confirmBrandAssetSchema = confirmBrandAssetUploadSchema;
export type PrepareBrandAssetInput = PrepareBrandAssetUploadInput;
export type ConfirmBrandAssetInput = ConfirmBrandAssetUploadInput;

export const captureBrandSnapshotSchema = z.object({
  entityType: z.enum([
    'quote',
    'purchase_order',
    'rfq',
    'contract',
    'change_order',
    'boq',
    'boq_progress_batch',
    'report',
    'work_order',
    'service_report',
    'daily_log',
    'inspection',
    'form_submission',
    'safety_record',
    'timesheet',
    'billing_record',
    'customer_statement',
    'subcontract',
    'closeout',
    'warranty',
    'warranty_issue',
    'communication',
  ]),
  entityId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  brandProfileId: z.string().uuid().optional().nullable(),
});

export type CaptureBrandSnapshotInput = z.input<typeof captureBrandSnapshotSchema>;

export const resolveDocumentBrandSchema = z.object({
  entityType: captureBrandSnapshotSchema.shape.entityType.optional(),
  entityId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional().nullable(),
  brandProfileId: z.string().uuid().optional().nullable(),
  useSnapshotIfPresent: z.boolean().optional(),
  theme: z.enum(['customer', 'internal']).optional(),
  locale: z.string().trim().min(2).max(32).optional(),
  dir: z.enum(['rtl', 'ltr']).optional(),
});

export type ResolveDocumentBrandInput = z.input<typeof resolveDocumentBrandSchema>;
