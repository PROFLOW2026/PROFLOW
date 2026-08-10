import { and, desc, eq, lt } from 'drizzle-orm';
import { auditEvents, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * Audit trail writer (docs 13, 65 I2).
 *
 * The audit trail is a product feature, not a log stream: it answers "who
 * changed this money figure and when" for the business owner. Application logs
 * stay separate and are never a substitute.
 *
 * Rows are append-only — the database rejects UPDATE and DELETE.
 */

/**
 * The closed set of auditable actions, named `<entity>.<verb>`.
 *
 * Every module registers here rather than passing loose strings, because the
 * activity log has to render a human sentence for each action — an unregistered
 * value would surface to the owner as a raw identifier.
 */
export const AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: 'organization.created',
  ORGANIZATION_UPDATED: 'organization.updated',
  MEMBERSHIP_CREATED: 'membership.created',
  MEMBERSHIP_UPDATED: 'membership.updated',
  MEMBERSHIP_REMOVED: 'membership.removed',
  ROLE_ASSIGNED: 'role.assigned',
  ROLE_PERMISSION_CHANGED: 'role.permission_changed',
  INVITATION_CREATED: 'invitation.created',
  INVITATION_ACCEPTED: 'invitation.accepted',
  INVITATION_REVOKED: 'invitation.revoked',
  SETTINGS_UPDATED: 'settings.updated',

  PROJECT_CREATED: 'project.created',
  PROJECT_UPDATED: 'project.updated',
  PROJECT_ARCHIVED: 'project.archived',
  PROJECT_TEMPLATE_APPLIED: 'project.template_applied',
  WORK_PACKAGE_CREATED: 'work_package.created',
  WORK_PACKAGE_UPDATED: 'work_package.updated',
  WORK_PACKAGE_ARCHIVED: 'work_package.archived',
  PHASE_CREATED: 'phase.created',
  PHASE_UPDATED: 'phase.updated',
  PHASE_ARCHIVED: 'phase.archived',
  MILESTONE_CREATED: 'milestone.created',
  MILESTONE_UPDATED: 'milestone.updated',
  MILESTONE_ARCHIVED: 'milestone.archived',
  CONTRACT_VALUE_RECORDED: 'contract.value_recorded',

  CLIENT_CREATED: 'client.created',
  CLIENT_UPDATED: 'client.updated',
  CLIENT_ARCHIVED: 'client.archived',
  CLIENT_CONTACT_CREATED: 'client_contact.created',
  CLIENT_CONTACT_UPDATED: 'client_contact.updated',
  CLIENT_CONTACT_DELETED: 'client_contact.deleted',
  PARTY_IDENTIFIER_UPSERTED: 'party_identifier.upserted',
  PARTY_IDENTIFIER_DELETED: 'party_identifier.deleted',

  VENDOR_CREATED: 'vendor.created',
  VENDOR_UPDATED: 'vendor.updated',
  VENDOR_ARCHIVED: 'vendor.archived',
  VENDOR_LINKED_FROM_EXPENSE: 'vendor.linked_from_expense',
  VENDOR_CONTACT_CREATED: 'vendor_contact.created',
  VENDOR_CONTACT_UPDATED: 'vendor_contact.updated',
  VENDOR_CONTACT_DELETED: 'vendor_contact.deleted',
  VENDOR_ENGAGEMENT_CREATED: 'vendor_engagement.created',
  VENDOR_ENGAGEMENT_ARCHIVED: 'vendor_engagement.archived',

  EXPENSE_CREATED: 'expense.created',
  EXPENSE_UPDATED: 'expense.updated',
  EXPENSE_FINALIZED: 'expense.finalized',
  EXPENSE_VOIDED: 'expense.voided',

  CHANGE_REQUEST_CREATED: 'change_request.created',
  CHANGE_REQUEST_UPDATED: 'change_request.updated',
  CHANGE_REQUEST_SUBMITTED: 'change_request.submitted',
  CHANGE_REQUEST_SENT: 'change_request.sent',
  CHANGE_REQUEST_REJECTED: 'change_request.rejected',
  CHANGE_REQUEST_CANCELLED: 'change_request.cancelled',
  CHANGE_REQUEST_APPROVED: 'change_request.approved',
  QUOTE_VERSION_CREATED: 'quote_version.created',
  QUOTE_VERSION_ISSUED: 'quote_version.issued',
  CHANGE_ORDER_CREATED: 'change_order.created',

  BILLING_RECORD_CREATED: 'billing_record.created',
  BILLING_RECORD_UPDATED: 'billing_record.updated',
  BILLING_RECORD_FINALIZED: 'billing_record.finalized',
  BILLING_RECORD_VOIDED: 'billing_record.voided',
  BILLING_RECORD_ADJUSTMENT_CREATED: 'billing_record.adjustment_created',
  PAYMENT_RECORDED: 'payment.recorded',
  PAYMENT_VOIDED: 'payment.voided',

  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_ARCHIVED: 'employee.archived',
  RATE_VERSION_CREATED: 'rate_version.created',
  TIME_ENTRY_CREATED: 'time_entry.created',

  DOCUMENT_UPLOADED: 'document.uploaded',
  DOCUMENT_FINALIZED: 'document.finalized',
  DOCUMENT_DELETED: 'document.deleted',

  CRM_PROSPECT_CREATED: 'crm.prospect_created',
  CRM_PROSPECT_UPDATED: 'crm.prospect_updated',
  CRM_LEAD_CREATED: 'crm.lead_created',
  CRM_LEAD_UPDATED: 'crm.lead_updated',
  CRM_OPPORTUNITY_CREATED: 'crm.opportunity_created',
  CRM_OPPORTUNITY_UPDATED: 'crm.opportunity_updated',
  CRM_OPPORTUNITY_NOTE_CREATED: 'crm.opportunity_note_created',
  CRM_OPPORTUNITY_CONVERTED: 'crm.opportunity_converted',
  CRM_ESTIMATE_CREATED: 'crm.estimate_created',
  CRM_ESTIMATE_UPDATED: 'crm.estimate_updated',
  CRM_SALES_QUOTE_CREATED: 'crm.sales_quote_created',
  CRM_SALES_QUOTE_VERSION_CREATED: 'crm.sales_quote_version_created',
  CRM_SALES_QUOTE_VERSION_ISSUED: 'crm.sales_quote_version_issued',
  CRM_QUOTE_ACCEPTED: 'crm.quote_accepted',

  COMPLIANCE_ARTIFACT_CREATED: 'compliance.artifact_created',
  COMPLIANCE_ARTIFACT_UPDATED: 'compliance.artifact_updated',

  PORTAL_GRANT_CREATED: 'portal.grant_created',
  PORTAL_GRANT_REVOKED: 'portal.grant_revoked',
  PORTAL_VENDOR_AP_CANDIDATE: 'portal.vendor_ap_candidate',
  PORTAL_VENDOR_COMPLIANCE_CANDIDATE: 'portal.vendor_compliance_candidate',
  PORTAL_VENDOR_CANDIDATE_REVIEWED: 'portal.vendor_candidate_reviewed',

  CUSTOM_FIELD_DEFINITION_CREATED: 'custom_field.definition_created',
  CUSTOM_FIELD_DEFINITION_UPDATED: 'custom_field.definition_updated',
  CUSTOM_FIELD_DEFINITION_ARCHIVED: 'custom_field.definition_archived',

  API_CLIENT_CREATED: 'api.client_created',
  API_KEY_CREATED: 'api.key_created',
  API_KEY_REVOKED: 'api.key_revoked',
  API_KEY_ROTATED: 'api.key_rotated',
  WEBHOOK_ENDPOINT_CREATED: 'api.webhook_created',
  WEBHOOK_ENDPOINT_REVOKED: 'api.webhook_revoked',
  WEBHOOK_SECRET_ROTATED: 'api.webhook_secret_rotated',
  WEBHOOK_DELIVERY_ENQUEUED: 'api.webhook_delivery_enqueued',

  MATERIAL_CREATED: 'material.created',
  MATERIAL_VENDOR_PRICE_CREATED: 'material_vendor_price.created',
  MATERIAL_VENDOR_PRICE_UPDATED: 'material_vendor_price.updated',
  MATERIAL_VENDOR_PRICE_DELETED: 'material_vendor_price.deleted',
  PROCUREMENT_RFQ_CREATED: 'procurement_rfq.created',
  PROCUREMENT_RFQ_STATUS_UPDATED: 'procurement_rfq.status_updated',
  SUPPLIER_QUOTE_CREATED: 'supplier_quote.created',
  SUPPLIER_QUOTE_STATUS_UPDATED: 'supplier_quote.status_updated',
  PURCHASE_ORDER_CREATED: 'purchase_order.created',
  PURCHASE_ORDER_ISSUED: 'purchase_order.issued',
  SUPPLIER_QUOTE_RECEIVED: 'procurement.supplier_quote_received',

  AP_BILL_CREATED: 'ap.bill_created',
  AP_MATCH_PROPOSED: 'ap.match_proposed',
  AP_MATCH_ACCEPTED: 'ap.match_accepted',
  AP_MATCH_REJECTED: 'ap.match_rejected',
  AP_PAYMENT_RECORDED: 'ap.payment_recorded',
  AP_PAYMENT_VOIDED: 'ap.payment_voided',

  DAILY_LOG_CREATED: 'daily_log.created',
  DAILY_LOG_UPDATED: 'daily_log.updated',
  PUNCH_LIST_ITEM_CREATED: 'punch_list_item.created',
  PUNCH_LIST_ITEM_UPDATED: 'punch_list_item.updated',
  INSPECTION_CREATED: 'inspection.created',
  INSPECTION_UPDATED: 'inspection.updated',

  ASSET_CREATED: 'asset.created',
  ASSET_UPDATED: 'asset.updated',
  FLEET_VEHICLE_CREATED: 'fleet_vehicle.created',
  FLEET_VEHICLE_UPDATED: 'fleet_vehicle.updated',
  MAINTENANCE_RECORD_CREATED: 'maintenance_record.created',
  MAINTENANCE_RECORD_UPDATED: 'maintenance_record.updated',
  INVENTORY_ITEM_CREATED: 'inventory_item.created',
  INVENTORY_MOVEMENT_RECORDED: 'inventory_movement.recorded',

  TAX_RULE_CREATED: 'tax_rule.created',
  TAX_RULE_UPDATED: 'tax_rule.updated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_ACTION_VALUES = Object.values(AUDIT_ACTIONS) as readonly AuditAction[];

/** Never written to the trail even if a caller passes them by accident. */
const REDACTED_KEYS = new Set([
  'password',
  'token',
  'tokenhash',
  'token_hash',
  'secret',
  'secrethash',
  'secret_hash',
  'apikey',
  'api_key',
  'keyhash',
  'key_hash',
  'plaintext',
  'plaintextsecret',
  'plaintext_secret',
  'servicerolekey',
  'service_role_key',
  'webhooksecretkek',
  'webhook_secret_kek',
  'authorization',
]);

const REDACTED = '[redacted]';

export function redactSnapshot(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => redactSnapshot(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : redactSnapshot(entry, depth + 1);
  }
  return result;
}

export interface AuditEventInput {
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Records an audited action. Call this inside the same transaction as the
 * mutation so the trail cannot drift from what actually happened.
 */
export async function recordAuditEvent(context: OrgContext, input: AuditEventInput): Promise<void> {
  await writeAuditEvent(context.db, {
    organizationId: context.organizationId,
    actorUserId: context.userId,
    ...input,
  });
}

export interface RawAuditEventInput extends AuditEventInput {
  readonly organizationId: string | null;
  readonly actorUserId: string | null;
}

/** For paths that run before an `OrgContext` exists, such as organization creation. */
export async function writeAuditEvent(db: DbExecutor, input: RawAuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before === undefined ? null : redactSnapshot(input.before),
    after: input.after === undefined ? null : redactSnapshot(input.after),
    metadata: input.metadata === undefined ? null : (redactSnapshot(input.metadata) as Record<string, unknown>),
  });
}

/** Safe audit row for UI / CSV — never includes before/after payload content. */
export interface AuditEventSummary {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorUserId: string | null;
  readonly actorDisplayName: string | null;
  readonly actorEmail: string | null;
  readonly createdAt: Date;
}

export interface AuditListResult {
  readonly items: readonly AuditEventSummary[];
  readonly nextCursor: string | null;
}

/**
 * Lists org audit events newest-first. Requires `audit.read`.
 * Does not return before/after snapshots (same contract as the activity UI).
 */
export async function listAuditEventSummaries(
  context: OrgContext,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<AuditListResult> {
  assertPermission(context, PERMISSIONS.AUDIT_READ);

  const pageSize = Math.min(Math.max(options.limit ?? 25, 1), 5_000);
  const cursorDate = options.cursor ? new Date(options.cursor) : null;

  const rows = await context.db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      actorUserId: auditEvents.actorUserId,
      actorDisplayName: profiles.displayName,
      actorEmail: profiles.email,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(profiles, eq(profiles.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.organizationId, context.organizationId),
        cursorDate ? lt(auditEvents.createdAt, cursorDate) : undefined,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const items = (hasMore ? rows.slice(0, pageSize) : rows).map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorUserId: row.actorUserId,
    actorDisplayName: row.actorDisplayName,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt,
  }));

  const nextCursor =
    hasMore && items.length > 0 ? items[items.length - 1]!.createdAt.toISOString() : null;

  return { items, nextCursor };
}
