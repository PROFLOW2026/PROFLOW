import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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
import { organizationMemberships, organizations } from './tenancy';

const APPROVAL_STEP_STRATEGY_COMPLETE_SQL = sql`(
  (approver_strategy = 'role_template' AND role_template_key IS NOT NULL AND permission_key IS NULL AND user_id IS NULL)
  OR (approver_strategy = 'permission' AND permission_key IS NOT NULL AND role_template_key IS NULL AND user_id IS NULL)
  OR (approver_strategy = 'user' AND user_id IS NOT NULL AND role_template_key IS NULL AND permission_key IS NULL)
)`;

/**
 * Organization business catalogs (Master Product Refinement).
 *
 * Org-scoped taxonomies: client types, vendor categories/specialties, payment
 * terms, cost codes, CRM sources/reasons, engagement roles, document requirements.
 * Status lifecycles stay hardcoded enums elsewhere — these are vocabulary only.
 *
 * Visibility of cost-code usage is product/profile driven; rows may exist while UI
 * is hidden. Deactivate (is_active=false / archived) — never hard-delete in-use values.
 */

export const BUSINESS_CATALOG_KINDS = [
  'client_type',
  'vendor_category',
  'vendor_specialty',
  'payment_term',
  'cost_code',
  'lead_source',
  'lost_reason',
  'engagement_role',
] as const;

export type BusinessCatalogKind = (typeof BUSINESS_CATALOG_KINDS)[number];

export const organizationCatalogEntries = pgTable(
  'organization_catalog_entries',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Optional parent (e.g. specialty → vendor_category). Same-org enforced by FK. */
    parentId: uuid('parent_id'),
    /**
     * Kind-specific config. Payment terms: { strategy, netDays?, eomOffsetDays? }.
     * Cost codes: { group?, code? }. Vendor categories: { affinity?: vendor_type[] }.
     */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('org_catalog_entries_id_org_uq').on(table.id, table.organizationId),
    /** Supports kind-aware composite FKs / (id, org, kind) identity. */
    uniqueIndex('org_catalog_entries_id_org_kind_uq').on(table.id, table.organizationId, table.kind),
    uniqueIndex('org_catalog_entries_org_kind_key_uq').on(table.organizationId, table.kind, table.key),
    index('org_catalog_entries_org_kind_idx').on(table.organizationId, table.kind, table.isActive),
    index('org_catalog_entries_parent_idx').on(table.parentId),
    check(
      'org_catalog_entries_kind_known',
      sql`${table.kind} IN (
        'client_type', 'vendor_category', 'vendor_specialty', 'payment_term',
        'cost_code', 'lead_source', 'lost_reason', 'engagement_role'
      )`,
    ),
    foreignKey({
      name: 'org_catalog_entries_parent_org_fk',
      columns: [table.parentId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
    }).onDelete('restrict'),
  ],
);

/** Many-to-many: vendor ↔ vendor_category catalog entries. */
export const vendorCatalogLinks = pgTable(
  'vendor_catalog_links',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    vendorId: uuid('vendor_id').notNull(),
    catalogEntryId: uuid('catalog_entry_id').notNull(),
    /** vendor_category | vendor_specialty */
    linkKind: text('link_kind').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('vendor_catalog_links_uq').on(table.vendorId, table.catalogEntryId, table.linkKind),
    uniqueIndex('vendor_catalog_links_id_org_uq').on(table.id, table.organizationId),
    index('vendor_catalog_links_vendor_idx').on(table.organizationId, table.vendorId),
    index('vendor_catalog_links_entry_idx').on(table.organizationId, table.catalogEntryId),
    check(
      'vendor_catalog_links_kind_known',
      sql`${table.linkKind} IN ('vendor_category', 'vendor_specialty')`,
    ),
  ],
);

/**
 * Required documents by context. Suggestions/seeds — not statutory law.
 * context_kind + optional catalog_entry_id or context_key (e.g. vendor_type=subcontractor).
 */
export const documentRequirementRules = pgTable(
  'document_requirement_rules',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    contextKind: text('context_kind').notNull(),
    catalogEntryId: uuid('catalog_entry_id'),
    contextKey: text('context_key'),
    documentTypeKey: text('document_type_key').notNull(),
    required: boolean('required').notNull().default(true),
    warnDaysBeforeExpiry: integer('warn_days_before_expiry'),
    label: text('label'),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    archivedAt: archivedAt(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('doc_requirement_rules_id_org_uq').on(table.id, table.organizationId),
    index('doc_requirement_rules_org_ctx_idx').on(table.organizationId, table.contextKind),
    check(
      'doc_requirement_rules_context_known',
      sql`${table.contextKind} IN (
        'vendor_category', 'vendor_type', 'subcontract', 'employee', 'project', 'organization'
      )`,
    ),
    check(
      'doc_requirement_rules_target_present',
      sql`num_nonnulls(${table.catalogEntryId}, ${table.contextKey}) >= 1
        OR ${table.contextKind} IN ('subcontract', 'organization')`,
    ),
  ],
);

/** Daily log ↔ real vendors on site (free-text column retained for legacy). */
export const dailyLogVendors = pgTable(
  'daily_log_vendors',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dailyLogId: uuid('daily_log_id').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('daily_log_vendors_uq').on(table.dailyLogId, table.vendorId),
    uniqueIndex('daily_log_vendors_id_org_uq').on(table.id, table.organizationId),
    index('daily_log_vendors_log_idx').on(table.organizationId, table.dailyLogId),
  ],
);

export const dailyLogEmployees = pgTable(
  'daily_log_employees',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dailyLogId: uuid('daily_log_id').notNull(),
    employeeId: uuid('employee_id').notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('daily_log_employees_uq').on(table.dailyLogId, table.employeeId),
    uniqueIndex('daily_log_employees_id_org_uq').on(table.id, table.organizationId),
    index('daily_log_employees_log_idx').on(table.organizationId, table.dailyLogId),
  ],
);

export const dailyLogAssets = pgTable(
  'daily_log_assets',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    dailyLogId: uuid('daily_log_id').notNull(),
    assetId: uuid('asset_id').notNull(),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('daily_log_assets_uq').on(table.dailyLogId, table.assetId),
    uniqueIndex('daily_log_assets_id_org_uq').on(table.id, table.organizationId),
    index('daily_log_assets_log_idx').on(table.organizationId, table.dailyLogId),
  ],
);

/** Ordered steps for an approval rule (Approvals 2.0). */
export const approvalRuleSteps = pgTable(
  'approval_rule_steps',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').notNull(),
    stepOrder: integer('step_order').notNull(),
    name: text('name'),
    /**
     * role_template = owner|manager|finance|worker
     * permission = any user with permission_key
     * user = specific user_id
     */
    approverStrategy: text('approver_strategy').notNull(),
    roleTemplateKey: text('role_template_key'),
    permissionKey: text('permission_key'),
    userId: uuid('user_id'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approval_rule_steps_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('approval_rule_steps_rule_order_uq').on(table.ruleId, table.stepOrder),
    index('approval_rule_steps_rule_idx').on(table.organizationId, table.ruleId),
    check(
      'approval_rule_steps_strategy_known',
      sql`${table.approverStrategy} IN ('role_template', 'permission', 'user')`,
    ),
    check('approval_rule_steps_order_positive', sql`${table.stepOrder} >= 1`),
    check('approval_rule_steps_strategy_complete', APPROVAL_STEP_STRATEGY_COMPLETE_SQL),
    foreignKey({
      name: 'approval_rule_steps_user_org_fk',
      columns: [table.organizationId, table.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
    }).onDelete('restrict'),
  ],
);

export const approvalRequestSteps = pgTable(
  'approval_request_steps',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id').notNull(),
    stepOrder: integer('step_order').notNull(),
    /** Immutable snapshot of the rule step at submit time. */
    name: text('name'),
    approverStrategy: text('approver_strategy').notNull(),
    roleTemplateKey: text('role_template_key'),
    permissionKey: text('permission_key'),
    userId: uuid('user_id'),
    status: text('status').notNull().default('pending'),
    decidedByUserId: uuid('decided_by_user_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
    decisionNote: text('decision_note'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('approval_request_steps_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('approval_request_steps_req_order_uq').on(table.requestId, table.stepOrder),
    index('approval_request_steps_req_idx').on(table.organizationId, table.requestId),
    check(
      'approval_request_steps_status_known',
      sql`${table.status} IN ('pending', 'approved', 'rejected')`,
    ),
    check('approval_request_steps_order_positive', sql`${table.stepOrder} >= 1`),
    check(
      'approval_request_steps_strategy_known',
      sql`${table.approverStrategy} IN ('role_template', 'permission', 'user')`,
    ),
    check('approval_request_steps_strategy_complete', APPROVAL_STEP_STRATEGY_COMPLETE_SQL),
    foreignKey({
      name: 'approval_request_steps_user_org_fk',
      columns: [table.organizationId, table.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
    }).onDelete('restrict'),
  ],
);

export const organizationCatalogEntriesRelations = relations(organizationCatalogEntries, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [organizationCatalogEntries.organizationId],
    references: [organizations.id],
  }),
  parent: one(organizationCatalogEntries, {
    fields: [organizationCatalogEntries.parentId],
    references: [organizationCatalogEntries.id],
    relationName: 'catalog_parent',
  }),
  children: many(organizationCatalogEntries, { relationName: 'catalog_parent' }),
}));
