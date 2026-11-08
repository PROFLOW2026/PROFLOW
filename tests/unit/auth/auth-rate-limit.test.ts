import { describe, expect, it } from 'vitest';
import {
  authAttemptPermitted,
  hashAuthRateLimitKey,
  readAuthRateLimitAllowed,
} from '@/shared/auth/auth-rate-limit';

describe('auth rate limit', () => {
  it('hashes an email to 64 hex characters and never includes @', () => {
    const email = 'Person@Example.com';
    const hash = hashAuthRateLimitKey(email);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash.includes('@')).toBe(false);
    expect(hash).not.toContain('Person');
    expect(hash).not.toContain('Example.com');
  });

  it('blocks the attempt when consume denies', async () => {
    let seenHash = '';
    const permitted = await authAttemptPermitted('user@example.com', async (keyHash) => {
      seenHash = keyHash;
      return readAuthRateLimitAllowed([{ allowed: false }]);
    });
    expect(seenHash).toHaveLength(64);
    expect(seenHash.includes('@')).toBe(false);
    expect(seenHash).not.toContain('@');
    expect(permitted).toBe(false);
  });

  it('blocks the attempt when consume throws because the SQL function is missing', async () => {
    const permitted = await authAttemptPermitted('user@example.com', async () => {
      throw new Error('function app.consume_auth_rate_limit(text, text, integer, integer) does not exist');
    });
    expect(permitted).toBe(false);
  });

  it('allows the attempt when consume grants', async () => {
    const permitted = await authAttemptPermitted('user@example.com', async () =>
      readAuthRateLimitAllowed([{ allowed: true }]),
    );
    expect(permitted).toBe(true);
  });
});
