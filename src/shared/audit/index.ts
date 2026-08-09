import { auditEvents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrgContext } from '@/shared/auth/context';

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
  'apikey',
  'api_key',
  'servicerolekey',
  'service_role_key',
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
