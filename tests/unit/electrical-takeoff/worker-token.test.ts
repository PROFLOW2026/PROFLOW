import { describe, expect, it } from 'vitest';
import { hashStoredToken, sealJobToken, verifyJobBearer, verifyStoredTokenHash } from '@/modules/electrical-takeoff/application/worker-token';

describe('worker token HMAC', () => {
  const secret = 'test-secret-32chars-minimum!!!!!!';

  it('seals and verifies bearer within TTL', () => {
    const now = Date.now();
    const sealed = sealJobToken('job-1', secret, 60_000, now);
    expect(verifyJobBearer(sealed.bearer, secret, now + 1000)?.jobId).toBe('job-1');
    expect(verifyJobBearer(sealed.bearer, secret, now + 120_000)).toBeNull();
  });

  it('stored hash matches bearer constant-time', () => {
    const sealed = sealJobToken('job-2', secret, 60_000, Date.now());
    const hash = hashStoredToken(sealed.bearer, secret);
    expect(verifyStoredTokenHash(sealed.bearer, secret, hash)).toBe(true);
    expect(verifyStoredTokenHash('bad', secret, hash)).toBe(false);
  });
});