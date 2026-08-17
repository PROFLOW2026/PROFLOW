/**
 * Outbound business messages. Status `sent` is provider-confirmed delivery only.
 * Quote lifecycle `sent` (issued) is a different concept and must not be mixed in.
 */

export const COMMUNICATION_STATUSES = [
  'draft',
  'queued',
  'sending',
  'sent',
  'failed',
  'cancelled',
] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export const COMMUNICATION_ENTITY_TYPES = [
  'quote',
  'purchase_order',
  'report',
  'project_summary',
  'billing_record',
  'payment_reminder',
  'vendor',
  'closeout',
  'warranty',
  'other',
] as const;
export type CommunicationEntityType = (typeof COMMUNICATION_ENTITY_TYPES)[number];

export const COMMUNICATION_ATTEMPT_RESULTS = ['not_configured', 'failed', 'delivered'] as const;
export type CommunicationAttemptResult = (typeof COMMUNICATION_ATTEMPT_RESULTS)[number];

export interface OutboundCommunicationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly relatedEntityType: CommunicationEntityType;
  readonly relatedEntityId: string | null;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly vendorId: string | null;
  readonly recipientEmail: string;
  readonly recipientName: string | null;
  readonly subject: string;
  readonly bodyText: string;
  readonly bodyHtml: string | null;
  readonly status: CommunicationStatus;
  readonly providerKey: string | null;
  readonly providerMessageId: string | null;
  readonly lastError: string | null;
  readonly sentAt: Date | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommunicationAttemptRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly communicationId: string;
  readonly result: CommunicationAttemptResult;
  readonly providerMessageId: string | null;
  readonly errorMessage: string | null;
  readonly attemptedAt: Date;
}

export interface CommunicationAttachmentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly communicationId: string;
  readonly documentId: string;
}

export interface CommunicationDetail extends OutboundCommunicationRecord {
  readonly attempts: readonly CommunicationAttemptRecord[];
  readonly attachments: readonly CommunicationAttachmentRecord[];
}
