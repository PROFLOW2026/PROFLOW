import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, moneyAmount, primaryId, timestamps } from './_shared';
import { clients } from './clients';
import { contracts } from './contracts';
import { organizations } from './tenancy';
import { projects } from './projects';
import { profiles } from './identity';

/**
 * CRM / pre-project lifecycle (doc 20).
 * Opportunity is not a Project. Conversion is explicit.
 * Does not duplicate ChangeRequest / ChangeOrder.
 */

export const crmProspects = pgTable(
  'crm_prospects',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('active'),
    email: text('email'),
    phone: text('phone'),
    companyName: text('company_name'),
    notes: text('notes'),
    convertedClientId: uuid('converted_client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('crm_prospects_org_idx').on(table.organizationId),
    check('crm_prospects_status_known', sql`${table.status} IN ('active', 'converted', 'inactive')`),
  ],
);

export const crmProspectContacts = pgTable(
  'crm_prospect_contacts',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id')
      .notNull()
      .references(() => crmProspects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    role: text('role'),
    ...timestamps(),
  },
  (table) => [index('crm_prospect_contacts_prospect_idx').on(table.prospectId)],
);

export const crmLeads = pgTable(
  'crm_leads',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => crmProspects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    source: text('source'),
    status: text('status').notNull().default('new'),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('crm_leads_org_idx').on(table.organizationId),
    check(
      'crm_leads_status_known',
      sql`${table.status} IN ('new', 'contacted', 'qualified', 'disqualified', 'converted')`,
    ),
  ],
);

export const crmOpportunities = pgTable(
  'crm_opportunities',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id').references(() => crmProspects.id, { onDelete: 'set null' }),
    leadId: uuid('lead_id').references(() => crmLeads.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    stage: text('stage').notNull().default('qualify'),
    status: text('status').notNull().default('open'),
    expectedValueAmount: moneyAmount('expected_value_amount'),
    currency: char('currency', { length: 3 }),
    expectedStartDate: date('expected_start_date'),
    referralSource: text('referral_source'),
    lostReason: text('lost_reason'),
    convertedClientId: uuid('converted_client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    convertedProjectId: uuid('converted_project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    convertedContractId: uuid('converted_contract_id').references(() => contracts.id, {
      onDelete: 'set null',
    }),
    convertedAt: timestamp('converted_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('crm_opportunities_org_idx').on(table.organizationId),
    index('crm_opportunities_org_status_idx').on(table.organizationId, table.status),
    check(
      'crm_opportunities_stage_known',
      sql`${table.stage} IN ('qualify', 'estimate', 'quote', 'negotiation', 'won', 'lost')`,
    ),
    check(
      'crm_opportunities_status_known',
      sql`${table.status} IN ('open', 'won', 'lost', 'cancelled')`,
    ),
  ],
);

export const crmOpportunityNotes = pgTable(
  'crm_opportunity_notes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => crmOpportunities.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [index('crm_opportunity_notes_opportunity_idx').on(table.opportunityId)],
);

export const crmEstimates = pgTable(
  'crm_estimates',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => crmOpportunities.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status').notNull().default('draft'),
    internalAmount: moneyAmount('internal_amount'),
    currency: char('currency', { length: 3 }).notNull(),
    notes: text('notes'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('crm_estimates_opportunity_idx').on(table.opportunityId),
    check('crm_estimates_status_known', sql`${table.status} IN ('draft', 'final', 'superseded')`),
  ],
);

export const crmSalesQuotes = pgTable(
  'crm_sales_quotes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    opportunityId: uuid('opportunity_id')
      .notNull()
      .references(() => crmOpportunities.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    currency: char('currency', { length: 3 }).notNull(),
    acceptedVersionId: uuid('accepted_version_id'),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    index('crm_sales_quotes_opportunity_idx').on(table.opportunityId),
    check(
      'crm_sales_quotes_status_known',
      sql`${table.status} IN ('draft', 'issued', 'accepted', 'rejected', 'cancelled')`,
    ),
  ],
);

export const crmSalesQuoteVersions = pgTable(
  'crm_sales_quote_versions',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    salesQuoteId: uuid('sales_quote_id')
      .notNull()
      .references(() => crmSalesQuotes.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull().default('draft'),
    subtotalAmount: moneyAmount('subtotal_amount').notNull(),
    taxAmount: moneyAmount('tax_amount'),
    totalAmount: moneyAmount('total_amount').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    alternateLabel: text('alternate_label'),
    notes: text('notes'),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }),
    ...timestamps(),
  },
  (table) => [
    index('crm_sales_quote_versions_quote_idx').on(table.salesQuoteId),
    uniqueIndex('crm_sales_quote_versions_uq').on(table.salesQuoteId, table.versionNumber),
    check(
      'crm_sales_quote_versions_status_known',
      sql`${table.status} IN ('draft', 'issued', 'superseded', 'accepted', 'rejected')`,
    ),
  ],
);

export const crmSalesQuoteLines = pgTable(
  'crm_sales_quote_lines',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id')
      .notNull()
      .references(() => crmSalesQuoteVersions.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: moneyAmount('quantity').notNull().default('1'),
    unitAmount: moneyAmount('unit_amount').notNull(),
    lineTotal: moneyAmount('line_total').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (table) => [index('crm_sales_quote_lines_version_idx').on(table.versionId)],
);
