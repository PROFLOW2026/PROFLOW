import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { externalNotifications, notifications } from '@drizzle/schema';
import { EVENT_DOMAIN, type DgNotificationEventType } from '@/modules/notifications/domain/types';
import type { DgCopyParams } from '@/modules/notifications/domain/dg-copy';
import type { DbExecutor } from '@/shared/db/types';
import type { DgSeverity } from '../domain/types';

/**
 * Trusted system writers (service role). `app.emit_notification` cannot be used here: it requires
 * the CALLER to be an org member, and the consumer has no user. Recipients were already checked
 * by the recipient repository (active org member + project capability).
 *
 * Burst collapse: one row per (recipient, dedupe key). A new event on the same subject bumps
 * `occurrences` while the row is still unread, restarts at 1 once it was read, and re-surfaces the
 * row as unread. Replaying the SAME event (same `lastEventId`) changes nothing (idempotent).
 */

export interface InternalDgNotificationInput {
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly type: DgNotificationEventType;
  readonly title: string;
  readonly body: string;
  readonly severity: DgSeverity;
  readonly entityType: string;
  readonly entityId: string;
  readonly deepLink: string | null;
  readonly dedupeKey: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly copyKey: string;
  readonly params: DgCopyParams;
  readonly projectId: string | null;
}

export async function upsertInternalDgNotification(db: DbExecutor, input: InternalDgNotificationInput): Promise<void> {
  const metadata = {
    dg: {
      copyKey: input.copyKey,
      eventType: input.eventType,
      params: input.params,
      occurrences: 1,
      lastEventId: input.eventId,
      projectId: input.projectId,
    },
  };
  const sameEvent = sql`(${notifications.metadata} -> 'dg' ->> 'lastEventId') = ${input.eventId}`;
  const stillOpen = sql`(${notifications.readAt} is null and ${notifications.dismissedAt} is null and ${notifications.resolvedAt} is null)`;
  await db
    .insert(notifications)
    .values({
      organizationId: input.organizationId,
      recipientUserId: input.recipientUserId,
      type: input.type,
      domain: EVENT_DOMAIN[input.type],
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      body: input.body,
      severity: input.severity,
      deepLink: input.deepLink,
      dedupeKey: input.dedupeKey,
      metadata,
    })
    .onConflictDoUpdate({
      target: [notifications.organizationId, notifications.recipientUserId, notifications.dedupeKey],
      set: {
        title: sql`case when ${sameEvent} then ${notifications.title} else excluded.title end`,
        body: sql`case when ${sameEvent} then ${notifications.body} else excluded.body end`,
        severity: sql`case when ${sameEvent} then ${notifications.severity} else excluded.severity end`,
        deepLink: sql`case when ${sameEvent} then ${notifications.deepLink} else excluded.deep_link end`,
        metadata: sql`case when ${sameEvent} then ${notifications.metadata}
          else jsonb_set(excluded.metadata, '{dg,occurrences}', to_jsonb(
            case when ${stillOpen}
              then coalesce((${notifications.metadata} -> 'dg' ->> 'occurrences')::int, 1) + 1
              else 1 end))
          end`,
        readAt: sql`case when ${sameEvent} then ${notifications.readAt} else null end`,
        dismissedAt: sql`case when ${sameEvent} then ${notifications.dismissedAt} else null end`,
        resolvedAt: sql`case when ${sameEvent} then ${notifications.resolvedAt} else null end`,
        updatedAt: sql`case when ${sameEvent} then ${notifications.updatedAt} else now() end`,
      },
    });
}

export interface ExternalDgNotificationInput {
  readonly organizationId: string;
  readonly principalId: string;
  readonly projectId: string | null;
  readonly vendorId: string | null;
  readonly agreementId: string | null;
  readonly eventId: string;
  readonly eventType: string;
  readonly requiredCapabilities: readonly string[];
  readonly copyKey: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly severity: DgSeverity;
  readonly deepLink: string | null;
  readonly params: DgCopyParams;
  readonly dedupeKey: string;
  readonly occurredAt: Date;
}

function cleanParams(params: DgCopyParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.trim()) result[key] = value.trim();
  }
  return result;
}

export async function upsertExternalDgNotification(db: DbExecutor, input: ExternalDgNotificationInput): Promise<void> {
  const sameEvent = sql`${externalNotifications.lastEventId} = ${input.eventId}`;
  await db
    .insert(externalNotifications)
    .values({
      organizationId: input.organizationId,
      principalId: input.principalId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      subcontractAgreementId: input.agreementId,
      eventType: input.eventType,
      requiredCapabilities: [...input.requiredCapabilities],
      copyKey: input.copyKey,
      entityType: input.entityType,
      entityId: input.entityId,
      severity: input.severity,
      deepLink: input.deepLink,
      params: cleanParams(input.params),
      dedupeKey: input.dedupeKey,
      occurrences: 1,
      lastEventId: input.eventId,
      lastOccurredAt: input.occurredAt,
    })
    .onConflictDoUpdate({
      target: [externalNotifications.organizationId, externalNotifications.principalId, externalNotifications.dedupeKey],
      set: {
        occurrences: sql`case when ${sameEvent} then ${externalNotifications.occurrences}
          when ${externalNotifications.readAt} is null and ${externalNotifications.dismissedAt} is null
            then ${externalNotifications.occurrences} + 1
          else 1 end`,
        params: sql`case when ${sameEvent} then ${externalNotifications.params} else excluded.params end`,
        severity: sql`case when ${sameEvent} then ${externalNotifications.severity} else excluded.severity end`,
        deepLink: sql`case when ${sameEvent} then ${externalNotifications.deepLink} else excluded.deep_link end`,
        vendorId: sql`case when ${sameEvent} then ${externalNotifications.vendorId} else excluded.vendor_id end`,
        subcontractAgreementId: sql`case when ${sameEvent} then ${externalNotifications.subcontractAgreementId}
          else excluded.subcontract_agreement_id end`,
        requiredCapabilities: sql`case when ${sameEvent} then ${externalNotifications.requiredCapabilities}
          else excluded.required_capabilities end`,
        lastEventId: sql`excluded.last_event_id`,
        lastOccurredAt: sql`case when ${sameEvent} then ${externalNotifications.lastOccurredAt}
          else excluded.last_occurred_at end`,
        readAt: sql`case when ${sameEvent} then ${externalNotifications.readAt} else null end`,
        dismissedAt: sql`case when ${sameEvent} then ${externalNotifications.dismissedAt} else null end`,
        updatedAt: sql`now()`,
      },
    });
}

/** Later events make earlier ones non-actionable: internal rows resolve, portal rows are dismissed. */
export async function resolveDgNotifications(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    /** Internal notification types of the resolved events (keeps the update on the org+type index). */
    readonly types: readonly DgNotificationEventType[];
    readonly dedupeKeys: readonly string[];
  },
): Promise<number> {
  if (input.dedupeKeys.length === 0 || input.types.length === 0) return 0;
  const now = new Date();
  const internal = await db
    .update(notifications)
    .set({ resolvedAt: now, updatedAt: now })
    .where(
      and(
        eq(notifications.organizationId, input.organizationId),
        inArray(notifications.type, [...input.types]),
        inArray(notifications.dedupeKey, [...input.dedupeKeys]),
        isNull(notifications.resolvedAt),
      ),
    )
    .returning({ id: notifications.id });
  const external = await db
    .update(externalNotifications)
    .set({ dismissedAt: now, updatedAt: now })
    .where(
      and(
        eq(externalNotifications.organizationId, input.organizationId),
        inArray(externalNotifications.dedupeKey, [...input.dedupeKeys]),
        isNull(externalNotifications.dismissedAt),
      ),
    )
    .returning({ id: externalNotifications.id });
  return internal.length + external.length;
}
