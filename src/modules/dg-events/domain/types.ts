import type { DgNotificationEventType } from '@/modules/notifications/domain/types';
import type { ProjectCapability } from '@/modules/project-team/domain/capabilities';
import type { ExternalCapability } from '@/shared/external/capabilities';

/** Row shape the consumer works with (read as service role from `domain_events`). */
export interface DomainEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorType: 'internal' | 'external' | 'system';
  readonly actorUserId: string | null;
  readonly actorPrincipalId: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
  readonly attempts: number;
}

/** Internal notification type (`public.notifications.type`) the event lands under. */
export type DgNotificationCategory = DgNotificationEventType;

export type DgSeverity = 'info' | 'warning' | 'urgent';

export interface DgLinkInput {
  readonly projectId: string | null;
  readonly entityId: string;
  /** Collapsed subject id (e.g. the coordination event of a contractor response). */
  readonly subjectId: string;
  readonly agreementId: string | null;
  readonly payload: Record<string, unknown>;
}

export interface DgInternalAudience {
  /** Any-of. Stored capabilities are pre-expanded, so `holds X` includes implied ones. */
  readonly capabilities: readonly ProjectCapability[];
  /** Payload keys holding internal user ids that should receive this notification (named wins). */
  readonly namedPayloadKeys?: readonly string[];
  /** Only named recipients; no capability fan-out. */
  readonly namedOnly?: boolean;
  readonly when?: (event: DomainEventRecord) => boolean;
}

export interface DgExternalAudience {
  /** Any-of, evaluated against the covering contractor grant. */
  readonly capabilities: readonly ExternalCapability[];
  /** Payload keys holding external principal ids (named principals still need a covering grant). */
  readonly namedPayloadKeys?: readonly string[];
  readonly namedOnly?: boolean;
  readonly when?: (event: DomainEventRecord) => boolean;
}

/** Declarative description of how one domain event becomes notifications. */
export interface DgEventSpec {
  readonly type: string;
  readonly category: DgNotificationCategory;
  /** true = money-adjacent: internal audience must consist of financial capabilities only. */
  readonly financial: boolean;
  readonly severity: DgSeverity | ((event: DomainEventRecord) => DgSeverity);
  readonly internal?: DgInternalAudience;
  readonly external?: DgExternalAudience;
  /** Payload key whose value replaces entityId as the collapse/link subject. */
  readonly subjectPayloadKey?: string;
  readonly internalLink: (input: DgLinkInput) => string | null;
  readonly portalLink: (input: DgLinkInput) => string | null;
  /** Earlier event types on the same subject that this event makes non-actionable. */
  readonly resolves?: readonly string[];
}

export interface DgHandlerResult {
  readonly internalRecipients: number;
  readonly externalRecipients: number;
  readonly resolved: number;
}
