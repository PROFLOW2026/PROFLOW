import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, primaryId, timestamps } from './_shared';
import { organizations } from './tenancy';

/**
 * Organization company identity + multi-brand profiles + document brand snapshots.
 * Migration: 0062_organization_branding.
 * Logo/signature/stamp keys live under `{orgId}/branding/...` (not Documents OCR).
 */

export const organizationCompanyProfiles = pgTable(
  'organization_company_profiles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    legalName: text('legal_name').notNull(),
    displayName: text('display_name').notNull(),
    tradingName: text('trading_name'),
    registrationNumber: text('registration_number'),
    vatTaxId: text('vat_tax_id'),
    extraIdentifiers: jsonb('extra_identifiers').$type<unknown[]>().notNull().default([]),
    website: text('website'),
    mainEmail: text('main_email'),
    mainPhone: text('main_phone'),
    secondaryPhone: text('secondary_phone'),
    whatsappPhone: text('whatsapp_phone'),
    billingEmail: text('billing_email'),
    salesEmail: text('sales_email'),
    supportEmail: text('support_email'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    region: text('region'),
    postalCode: text('postal_code'),
    countryCode: char('country_code', { length: 2 }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_company_profiles_org_uq').on(table.organizationId),
    index('organization_company_profiles_org_idx').on(table.organizationId),
    check(
      'organization_company_profiles_extra_identifiers_is_array',
      sql`jsonb_typeof(${table.extraIdentifiers}) = 'array'`,
    ),
  ],
);

export const organizationBrandProfiles = pgTable(
  'organization_brand_profiles',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    status: text('status').notNull().default('active'),
    logoPrimaryKey: text('logo_primary_key'),
    logoPrimaryContentType: text('logo_primary_content_type'),
    logoPrimaryByteSize: integer('logo_primary_byte_size'),
    logoPrimaryWidth: integer('logo_primary_width'),
    logoPrimaryHeight: integer('logo_primary_height'),
    logoCompactKey: text('logo_compact_key'),
    logoCompactContentType: text('logo_compact_content_type'),
    logoDarkKey: text('logo_dark_key'),
    logoDarkContentType: text('logo_dark_content_type'),
    logoLightKey: text('logo_light_key'),
    logoLightContentType: text('logo_light_content_type'),
    signatureImageKey: text('signature_image_key'),
    signatureImageContentType: text('signature_image_content_type'),
    stampImageKey: text('stamp_image_key'),
    stampImageContentType: text('stamp_image_content_type'),
    primaryColor: text('primary_color').notNull().default('#0F766E'),
    secondaryColor: text('secondary_color').notNull().default('#334155'),
    headerLayout: text('header_layout').notNull().default('letterhead'),
    footerStyle: text('footer_style').notNull().default('detailed'),
    documentTheme: text('document_theme').notNull().default('customer'),
    templatePreset: text('template_preset').notNull().default('standard'),
    showLogo: boolean('show_logo').notNull().default(true),
    showLegalName: boolean('show_legal_name').notNull().default(true),
    showDisplayName: boolean('show_display_name').notNull().default(true),
    showRegistrationNumber: boolean('show_registration_number').notNull().default(true),
    showVatTaxId: boolean('show_vat_tax_id').notNull().default(true),
    showAddress: boolean('show_address').notNull().default(true),
    showPhone: boolean('show_phone').notNull().default(true),
    showEmail: boolean('show_email').notNull().default(true),
    showWebsite: boolean('show_website').notNull().default(true),
    showPageNumbers: boolean('show_page_numbers').notNull().default(true),
    showGeneratedDate: boolean('show_generated_date').notNull().default(true),
    showDocumentReference: boolean('show_document_reference').notNull().default(true),
    allowSignatureOnQuotes: boolean('allow_signature_on_quotes').notNull().default(false),
    allowSignatureOnReports: boolean('allow_signature_on_reports').notNull().default(false),
    allowStamp: boolean('allow_stamp').notNull().default(false),
    includeSignatureByDefault: boolean('include_signature_by_default').notNull().default(false),
    includeStampByDefault: boolean('include_stamp_by_default').notNull().default(false),
    footerCustomText: text('footer_custom_text'),
    quoteFooterText: text('quote_footer_text'),
    quoteTermsText: text('quote_terms_text'),
    reportFooterText: text('report_footer_text'),
    paymentInstructionsText: text('payment_instructions_text'),
    generalDocumentNote: text('general_document_note'),
    emailSignatureText: text('email_signature_text'),
    poTermsText: text('po_terms_text'),
    serviceReportNote: text('service_report_note'),
    reportDisclaimerText: text('report_disclaimer_text'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('organization_brand_profiles_org_name_uq').on(table.organizationId, table.name),
    uniqueIndex('organization_brand_profiles_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('organization_brand_profiles_one_default_uq')
      .on(table.organizationId)
      .where(
        sql`${table.isDefault} = true AND ${table.status} = 'active' AND ${table.archivedAt} IS NULL`,
      ),
    index('organization_brand_profiles_org_idx').on(table.organizationId),
    check(
      'organization_brand_profiles_status_known',
      sql`${table.status} IN ('active', 'archived')`,
    ),
    check(
      'organization_brand_profiles_active_archive_consistency',
      sql`(
        (${table.status} = 'active' AND ${table.archivedAt} IS NULL)
        OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL)
      )`,
    ),
    check(
      'organization_brand_profiles_header_layout_known',
      sql`${table.headerLayout} IN ('letterhead', 'logo_sides', 'centered', 'minimal')`,
    ),
    check(
      'organization_brand_profiles_footer_style_known',
      sql`${table.footerStyle} IN ('minimal', 'detailed', 'legal')`,
    ),
    check(
      'organization_brand_profiles_document_theme_known',
      sql`${table.documentTheme} IN ('customer', 'internal')`,
    ),
    check(
      'organization_brand_profiles_template_preset_known',
      sql`${table.templatePreset} IN ('standard', 'minimal', 'formal', 'detailed')`,
    ),
    check(
      'organization_brand_profiles_primary_color_hex',
      sql`${table.primaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
    check(
      'organization_brand_profiles_secondary_color_hex',
      sql`${table.secondaryColor} ~ '^#[0-9A-Fa-f]{6}$'`,
    ),
  ],
);

export const documentBrandSnapshots = pgTable(
  'document_brand_snapshots',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    brandProfileId: uuid('brand_profile_id'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_brand_snapshots_entity_uq').on(
      table.organizationId,
      table.entityType,
      table.entityId,
    ),
    index('document_brand_snapshots_org_idx').on(table.organizationId),
    check(
      'document_brand_snapshots_entity_type_known',
      sql`${table.entityType} IN (
        'quote', 'purchase_order', 'rfq', 'contract', 'change_order', 'boq',
        'boq_progress_batch', 'report',
        'work_order', 'service_report', 'daily_log', 'inspection', 'form_submission',
        'safety_record', 'timesheet', 'billing_record', 'customer_statement',
        'subcontract', 'closeout', 'warranty', 'warranty_issue', 'communication'
      )`,
    ),
    check(
      'document_brand_snapshots_snapshot_is_object',
      sql`jsonb_typeof(${table.snapshot}) = 'object'`,
    ),
    foreignKey({
      name: 'document_brand_snapshots_brand_org_fk',
      columns: [table.brandProfileId, table.organizationId],
      foreignColumns: [organizationBrandProfiles.id, organizationBrandProfiles.organizationId],
    }).onDelete('restrict'),
  ],
);
