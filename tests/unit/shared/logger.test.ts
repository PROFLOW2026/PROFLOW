import { describe, expect, it } from 'vitest';
import { redactEmail, redactForLog } from '@/shared/observability';

describe('observability redaction', () => {
  it('masks email local-parts', () => {
    expect(redactEmail('owner@example.com')).toBe('o***@example.com');
  });

  it('redacts secret-shaped keys and inline emails', () => {
    const redacted = redactForLog({
      password: 'super-secret',
      apiKey: 'sk-live',
      note: 'contact admin@acme.test please',
      nested: { serviceRoleKey: 'role-secret', ok: true },
    }) as Record<string, unknown>;

    expect(redacted.password).toBe('[redacted]');
    expect(redacted.apiKey).toBe('[redacted]');
    expect(redacted.note).toContain('a***@acme.test');
    expect((redacted.nested as Record<string, unknown>).serviceRoleKey).toBe('[redacted]');
    expect((redacted.nested as Record<string, unknown>).ok).toBe(true);
  });

  it('serializes errors without stacking raw secrets in messages containing emails', () => {
    const redacted = redactForLog(new Error('failed for user@example.com')) as {
      message: string;
    };
    expect(redacted.message).toContain('u***@example.com');
    expect(redacted.message).not.toContain('user@example.com');
  });
});
