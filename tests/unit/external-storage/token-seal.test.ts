import { describe, expect, it } from 'vitest';
import {
  openOAuthPayload,
  openStorageSecret,
  sealOAuthPayload,
  sealStorageSecret,
} from '@/modules/external-storage/application/token-seal';

describe('storage token seal', () => {
  it('round-trips OAuth payload', () => {
    const sealed = sealOAuthPayload({
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
      expiresAt: new Date().toISOString(),
      scopes: ['Files.ReadWrite'],
    });
    const opened = openOAuthPayload(sealed);
    expect(opened.accessToken).toBe('access-test');
    expect(opened.refreshToken).toBe('refresh-test');
  });

  it('seals and opens arbitrary secrets', () => {
    const kek = Buffer.alloc(32, 7);
    const sealed = sealStorageSecret('secret-value', kek);
    expect(openStorageSecret(sealed, kek)).toBe('secret-value');
  });
});
