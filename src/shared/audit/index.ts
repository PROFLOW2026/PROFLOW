import 'server-only';
import { and, desc, eq, lt } from 'drizzle-orm';
import { auditEvents, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { AuditAction } from './actions';
import type { AuditEventSummary, AuditListResult } from './types';

export { AUDIT_ACTIONS, AUDIT_ACTION_VALUES, type AuditAction } from './actions';
export type { AuditEventSummary, AuditListResult } from './types';

/**
 * Audit trail writer (docs 13, 65 I2).
 *
 * The audit trail is a product feature, not a log stream: it answers "who
 * changed this money figure and when" for the business owner. Application logs
 * stay separate and are never a substitute.
 *
 * Rows are append-only — the database rejects UPDATE and DELETE.
 *
 * `AUDIT_ACTIONS` live in `./actions` so client/domain code can import the
 * catalog without pulling Drizzle into the browser bundle.
 */

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

/**
 * Org-scoped audit summaries for one entity. Used by module history panels
 * (notes + stored audit), not as a substitute for an activity table.
 * CRM entity types are readable with `crm.read`; everything else needs `audit.read`.
 */
export async function listAuditEventSummariesForEntity(
  context: OrgContext,
  options: { entityType: string; entityId: string; limit?: number },
): Promise<readonly AuditEventSummary[]> {
  if (options.entityType.startsWith('crm_')) {
    assertPermission(context, PERMISSIONS.CRM_READ);
  } else {
    assertPermission(context, PERMISSIONS.AUDIT_READ);
  }

  const pageSize = Math.min(Math.max(options.limit ?? 50, 1), 200);

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
        eq(auditEvents.entityType, options.entityType),
        eq(auditEvents.entityId, options.entityId),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(pageSize);

  return rows;
}
