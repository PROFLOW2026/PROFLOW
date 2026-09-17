import { afterEach, describe, expect, it } from 'vitest';
import {
  openTemporaryPinSealed,
  sealTemporaryPin,
  TEMP_PIN_SEAL_PREFIX,
} from '@/modules/employee-app/domain/temporary-pin-seal';

describe('temporary-pin-seal', () => {
  const previousStorageKey = process.env.STORAGE_TOKEN_ENCRYPTION_KEY;

  afterEach(() => {
    if (previousStorageKey === undefined) {
      delete process.env.STORAGE_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.STORAGE_TOKEN_ENCRYPTION_KEY = previousStorageKey;
    }
  });

  it('seals and opens a valid temporary PIN', () => {
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const sealed = sealTemporaryPin('123456');
    expect(sealed.startsWith(TEMP_PIN_SEAL_PREFIX)).toBe(true);
    expect(openTemporaryPinSealed(sealed)).toBe('123456');
  });

  it('rejects invalid PIN before sealing', () => {
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(() => sealTemporaryPin('12345')).toThrow(/Invalid temporary PIN/);
  });

  it('rejects tampered sealed payload', () => {
    process.env.STORAGE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    const sealed = sealTemporaryPin('654321');
    const parts = sealed.split(':');
    parts[parts.length - 1] = 'AAAA';
    const tampered = parts.join(':');
    expect(() => openTemporaryPinSealed(tampered)).toThrow();
  });
});
