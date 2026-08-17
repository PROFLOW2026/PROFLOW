import { describe, expect, it } from 'vitest';
import { canMarkCommunicationSent, resolveSendOutcome } from '@/modules/communications/domain/send-policy';
import type { EmailDeliveryResult } from '@/modules/communications/domain/send-policy';

describe('communications sent-only-when-delivered', () => {
  it('marks sent only when delivered is true and providerId is present', () => {
    const result: EmailDeliveryResult = { delivered: true, providerId: 'resend_abc' };
    expect(canMarkCommunicationSent(result)).toBe(true);
    const outcome = resolveSendOutcome(result, new Date('2026-08-17T12:00:00Z'));
    expect(outcome.status).toBe('sent');
    expect(outcome.attemptResult).toBe('delivered');
    expect(outcome.providerMessageId).toBe('resend_abc');
    expect(outcome.sentAt?.toISOString()).toBe('2026-08-17T12:00:00.000Z');
  });

  it('does not mark sent when the provider is not configured', () => {
    const result: EmailDeliveryResult = { delivered: false, reason: 'not-configured' };
    expect(canMarkCommunicationSent(result)).toBe(false);
    const outcome = resolveSendOutcome(result);
    expect(outcome.status).toBe('draft');
    expect(outcome.attemptResult).toBe('not_configured');
    expect(outcome.providerMessageId).toBeNull();
    expect(outcome.sentAt).toBeNull();
  });

  it('does not mark sent when delivered is true but providerId is missing', () => {
    const result: EmailDeliveryResult = { delivered: true, providerId: null };
    expect(canMarkCommunicationSent(result)).toBe(false);
    const outcome = resolveSendOutcome(result);
    expect(outcome.status).toBe('failed');
    expect(outcome.attemptResult).toBe('failed');
    expect(outcome.providerMessageId).toBeNull();
    expect(outcome.sentAt).toBeNull();
  });

  it('does not mark sent on a failed provider call', () => {
    const result: EmailDeliveryResult = { delivered: false, reason: 'failed', message: 'timeout' };
    expect(canMarkCommunicationSent(result)).toBe(false);
    const outcome = resolveSendOutcome(result);
    expect(outcome.status).toBe('failed');
    expect(outcome.attemptResult).toBe('failed');
    expect(outcome.lastError).toBe('timeout');
  });
});
