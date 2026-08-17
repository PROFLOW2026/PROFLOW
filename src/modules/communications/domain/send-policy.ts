import type { CommunicationAttemptResult, CommunicationStatus } from './types';

/**
 * A message is marked `sent` only when the email port confirms delivery
 * AND returns a non-empty provider id. Missing provider id fails the DB check
 * `outbound_communications_sent_requires_provider`.
 */

export type EmailDeliveryResult =
  | { delivered: true; providerId: string | null }
  | { delivered: false; reason: 'not-configured' | 'failed'; message?: string };

export function canMarkCommunicationSent(result: EmailDeliveryResult): boolean {
  return (
    result.delivered === true &&
    typeof result.providerId === 'string' &&
    result.providerId.trim().length > 0
  );
}

export interface SendResolution {
  readonly status: Extract<CommunicationStatus, 'draft' | 'sent' | 'failed'>;
  readonly attemptResult: CommunicationAttemptResult;
  readonly providerMessageId: string | null;
  readonly sentAt: Date | null;
  readonly lastError: string | null;
}

export function resolveSendOutcome(result: EmailDeliveryResult, now: Date = new Date()): SendResolution {
  if (canMarkCommunicationSent(result) && result.delivered === true) {
    return {
      status: 'sent',
      attemptResult: 'delivered',
      providerMessageId: result.providerId!.trim(),
      sentAt: now,
      lastError: null,
    };
  }

  if (result.delivered === false && result.reason === 'not-configured') {
    return {
      status: 'draft',
      attemptResult: 'not_configured',
      providerMessageId: null,
      sentAt: null,
      lastError: result.message ?? null,
    };
  }

  const message =
    result.delivered === false
      ? (result.message ?? result.reason)
      : 'Delivery confirmation is missing a provider id';

  return {
    status: 'failed',
    attemptResult: 'failed',
    providerMessageId: null,
    sentAt: null,
    lastError: message,
  };
}

export function isTerminalCommunicationStatus(status: CommunicationStatus): boolean {
  return status === 'sent' || status === 'cancelled';
}
