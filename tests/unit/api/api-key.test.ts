import { describe, expect, it } from 'vitest';
import {
  extractKeyPrefix,
  generateApiKeyMaterial,
  hashSecret,
  secretsEqual,
  API_KEY_PREFIX_LENGTH,
} from '@/modules/api/domain/api-key';

describe('api key material', () => {
  it('stores hash and prefix only — plaintext is not the hash', () => {
    const material = generateApiKeyMaterial();
    expect(material.plaintext.startsWith('pfk_')).toBe(true);
    expect(material.keyPrefix).toHaveLength(API_KEY_PREFIX_LENGTH);
    expect(material.keyPrefix).toBe(extractKeyPrefix(material.plaintext));
    expect(material.keyHash).toBe(hashSecret(material.plaintext));
    expect(material.keyHash).not.toBe(material.plaintext);
  });

  it('compares hashes with constant-time equality', () => {
    const hash = hashSecret('pfk_test');
    expect(secretsEqual(hash, hash)).toBe(true);
    expect(secretsEqual(hash, hashSecret('other'))).toBe(false);
  });
});
