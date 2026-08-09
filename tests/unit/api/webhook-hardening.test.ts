import { describe, expect, it } from 'vitest';
import {
  enqueueDeliverySchema,
  registerWebhookSchema,
  revokeWebhookSchema,
  rotateWebhookSecretSchema,
} from '@/modules/api/validation/schemas';
import { isAllowedWebhookEventType, WEBHOOK_EVENT_TYPES } from '@/modules/api/domain/webhook-events';
import {
  buildWebhookEventEnvelope,
  extractWebhookEventId,
  serializeWebhookEventBody,
} from '@/modules/api/domain/webhook-envelope';
import {
  buildWebhookSignatureHeaders,
  DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
  formatWebhookSignatureHeader,
  parseWebhookSignatureHeader,
  signWebhookPayload,
  verifyWebhookSecretMatchesHash,
  verifyWebhookSignature,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from '@/modules/api/domain/webhook-signature';
import { generateWebhookSecretMaterial, hashSecret } from '@/modules/api/domain/api-key';
import {
  isLoopbackHost,
  isPrivateOrLocalIpv4,
  isPrivateOrLocalIpv6,
  validateWebhookEndpointUrl,
} from '@/modules/api/domain/webhook-url';
import {
  applyDeliveryAttempt,
  assertDeliveryStatusTransition,
  canTransitionDeliveryStatus,
  initialDeliveryState,
  isTerminalDeliveryStatus,
  MAX_WEBHOOK_DELIVERY_ATTEMPTS,
  scheduleDeliveryRetry,
} from '@/modules/api/domain/delivery-state';

describe('webhook event allowlist', () => {
  it('accepts only foundation event types', () => {
    expect(isAllowedWebhookEventType('test.ping')).toBe(true);
    expect(isAllowedWebhookEventType('project.updated')).toBe(true);
    expect(isAllowedWebhookEventType('invoice.paid.custom')).toBe(false);
    expect(WEBHOOK_EVENT_TYPES).toContain('api.key.revoked');
  });

  it('rejects free-form event types in schemas', () => {
    const register = registerWebhookSchema.safeParse({
      url: 'https://hooks.example.com/pf',
      eventTypes: ['not.an.allowed.event'],
    });
    expect(register.success).toBe(false);

    const enqueue = enqueueDeliverySchema.safeParse({
      endpointId: '00000000-0000-4000-8000-000000000099',
      eventType: 'wildcard.*',
      payload: {},
    });
    expect(enqueue.success).toBe(false);
  });

  it('accepts revoke and rotate-secret endpoint ids', () => {
    const endpointId = '00000000-0000-4000-8000-000000000042';
    expect(revokeWebhookSchema.safeParse({ endpointId }).success).toBe(true);
    expect(rotateWebhookSecretSchema.safeParse({ endpointId }).success).toBe(true);
    expect(revokeWebhookSchema.safeParse({ endpointId: 'not-a-uuid' }).success).toBe(false);
    expect(rotateWebhookSecretSchema.safeParse({}).success).toBe(false);
  });

  it('accepts optional eventId for idempotent enqueue', () => {
    const ok = enqueueDeliverySchema.safeParse({
      endpointId: '00000000-0000-4000-8000-000000000099',
      eventType: 'test.ping',
      payload: { ping: true },
      eventId: '00000000-0000-4000-8000-000000000011',
    });
    expect(ok.success).toBe(true);
  });
});

describe('webhook endpoint URL validation', () => {
  it('allows https public hosts', () => {
    expect(validateWebhookEndpointUrl('https://hooks.example.com/path')).toEqual({
      ok: true,
      url: 'https://hooks.example.com/path',
    });
  });

  it('allows http only for loopback', () => {
    expect(validateWebhookEndpointUrl('http://localhost:3000/hook').ok).toBe(true);
    expect(validateWebhookEndpointUrl('http://example.com/hook')).toEqual({
      ok: false,
      reason: 'scheme_forbidden',
    });
  });

  it('rejects credentials, private targets, and metadata hosts', () => {
    expect(validateWebhookEndpointUrl('https://user:pass@hooks.example.com/')).toEqual({
      ok: false,
      reason: 'credentials_forbidden',
    });
    expect(validateWebhookEndpointUrl('https://10.0.0.5/hook')).toEqual({
      ok: false,
      reason: 'private_target',
    });
    expect(validateWebhookEndpointUrl('https://metadata.google.internal/')).toEqual({
      ok: false,
      reason: 'host_forbidden',
    });
    expect(isPrivateOrLocalIpv4('192.168.1.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
  });

  it('rejects private and link-local IPv6 webhook targets', () => {
    expect(validateWebhookEndpointUrl('https://[fc00::1]/hook')).toEqual({
      ok: false,
      reason: 'private_target',
    });
    expect(validateWebhookEndpointUrl('https://[fd12:3456:789a::1]/hook')).toEqual({
      ok: false,
      reason: 'private_target',
    });
    expect(validateWebhookEndpointUrl('https://[fe80::1]/hook')).toEqual({
      ok: false,
      reason: 'private_target',
    });
    expect(validateWebhookEndpointUrl('https://[::ffff:10.0.0.5]/hook')).toEqual({
      ok: false,
      reason: 'private_target',
    });
    expect(isPrivateOrLocalIpv6('fc00::1')).toBe(true);
    expect(isPrivateOrLocalIpv6('fe80::abcd')).toBe(true);
    expect(isPrivateOrLocalIpv6('2001:db8::1')).toBe(false);
  });

  it('wires URL checks into registerWebhookSchema', () => {
    expect(
      registerWebhookSchema.safeParse({
        url: 'https://hooks.example.com/ok',
        eventTypes: ['test.ping'],
      }).success,
    ).toBe(true);
    expect(
      registerWebhookSchema.safeParse({
        url: 'http://evil.example/hook',
        eventTypes: ['test.ping'],
      }).success,
    ).toBe(false);
  });
});

describe('webhook event envelope', () => {
  it('builds envelope with stable eventId', () => {
    const envelope = buildWebhookEventEnvelope({
      eventType: 'test.ping',
      data: { ok: true },
      eventId: '00000000-0000-4000-8000-000000000042',
      occurredAt: '2026-08-09T12:00:00.000Z',
    });
    expect(envelope).toEqual({
      eventId: '00000000-0000-4000-8000-000000000042',
      eventType: 'test.ping',
      occurredAt: '2026-08-09T12:00:00.000Z',
      data: { ok: true },
    });
    expect(extractWebhookEventId(envelope)).toBe(envelope.eventId);
    expect(JSON.parse(serializeWebhookEventBody(envelope))).toEqual(envelope);
  });

  it('rejects non-uuid event ids', () => {
    expect(() =>
      buildWebhookEventEnvelope({
        eventType: 'test.ping',
        data: {},
        eventId: 'not-a-uuid',
      }),
    ).toThrow(/UUID/);
  });
});

describe('webhook signature helpers', () => {
  it('signs and verifies with timestamp tolerance (replay window)', () => {
    const { plaintext, secretHash } = generateWebhookSecretMaterial();
    expect(verifyWebhookSecretMatchesHash(plaintext, secretHash)).toBe(true);
    expect(verifyWebhookSecretMatchesHash('whsec_wrong', secretHash)).toBe(false);

    const envelope = buildWebhookEventEnvelope({
      eventType: 'test.ping',
      data: { n: 1 },
      eventId: '00000000-0000-4000-8000-000000000077',
    });
    const body = serializeWebhookEventBody(envelope);
    const timestamp = 1_700_000_000;
    const built = buildWebhookSignatureHeaders({
      plaintextSecret: plaintext,
      body,
      eventId: envelope.eventId,
      timestampSeconds: timestamp,
    });

    expect(built.headers[WEBHOOK_EVENT_ID_HEADER]).toBe(envelope.eventId);
    expect(built.headers[WEBHOOK_SIGNATURE_HEADER]).toBe(
      formatWebhookSignatureHeader(timestamp, signWebhookPayload(plaintext, body, timestamp)),
    );
    expect(
      verifyWebhookSignature({
        plaintextSecret: plaintext,
        body,
        signatureHeader: built.headers[WEBHOOK_SIGNATURE_HEADER]!,
        nowSeconds: timestamp,
      }),
    ).toBe(true);

    expect(
      verifyWebhookSignature({
        plaintextSecret: plaintext,
        body,
        signatureHeader: built.headers[WEBHOOK_SIGNATURE_HEADER]!,
        nowSeconds: timestamp + DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS + 1,
      }),
    ).toBe(false);

    const parsed = parseWebhookSignatureHeader(built.headers[WEBHOOK_SIGNATURE_HEADER]!);
    expect(parsed?.timestampSeconds).toBe(timestamp);
    expect(hashSecret(plaintext)).toBe(secretHash);
  });
});

describe('webhook delivery retry state', () => {
  it('starts pending with zero attempts', () => {
    expect(initialDeliveryState()).toEqual({
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      deliveredAt: null,
      lastHttpStatus: null,
    });
  });

  it('marks success as delivered and bumps attempt count', () => {
    const now = new Date('2026-08-09T12:00:00Z');
    const next = applyDeliveryAttempt(initialDeliveryState(), 'success', {
      now,
      httpStatus: 204,
    });
    expect(next).toEqual({
      status: 'delivered',
      attemptCount: 1,
      lastError: null,
      deliveredAt: now,
      lastHttpStatus: 204,
    });
    expect(isTerminalDeliveryStatus(next.status)).toBe(true);
  });

  it('encodes HTTP status into lastError on failure', () => {
    const next = applyDeliveryAttempt(initialDeliveryState(), 'failure', {
      error: 'timeout',
      httpStatus: 502,
    });
    expect(next.status).toBe('failed');
    expect(next.lastError).toBe('HTTP 502: timeout');
    expect(next.lastHttpStatus).toBe(502);
  });

  it('fails until max attempts then abandons', () => {
    let state = initialDeliveryState();
    for (let i = 1; i < MAX_WEBHOOK_DELIVERY_ATTEMPTS; i += 1) {
      state = applyDeliveryAttempt(state, 'failure', { error: `fail-${i}` });
      expect(state.status).toBe('failed');
      expect(state.attemptCount).toBe(i);
      state = scheduleDeliveryRetry(state);
      expect(state.status).toBe('pending');
      expect(state.attemptCount).toBe(i);
    }
    state = applyDeliveryAttempt(state, 'failure', { error: 'final' });
    expect(state.status).toBe('abandoned');
    expect(state.attemptCount).toBe(MAX_WEBHOOK_DELIVERY_ATTEMPTS);
    expect(() => scheduleDeliveryRetry(state)).toThrow(/exhausted/);
  });

  it('blocks illegal transitions and terminal re-attempts', () => {
    expect(canTransitionDeliveryStatus('delivered', 'pending')).toBe(false);
    expect(() => assertDeliveryStatusTransition('abandoned', 'failed')).toThrow(
      /Invalid webhook delivery/,
    );
    expect(() =>
      applyDeliveryAttempt(
        {
          status: 'delivered',
          attemptCount: 1,
          lastError: null,
          lastHttpStatus: 200,
          deliveredAt: new Date(),
        },
        'failure',
      ),
    ).toThrow(/terminal/);
  });
});
