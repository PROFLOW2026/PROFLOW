import { describe, expect, it } from 'vitest';
import {
  extractKeyPrefix,
  generateApiKeyMaterial,
  generateWebhookSecretMaterial,
  hashSecret,
  isSha256HexDigest,
  looksLikeApiKey,
  secretsEqual,
  API_KEY_PREFIX_LENGTH,
} from '@/modules/api/domain/api-key';
import {
  createApiKeySchema,
  rotateApiKeySchema,
} from '@/modules/api/validation/schemas';

describe('api key material', () => {
  it('stores hash and prefix only - plaintext is not the hash', () => {
    const material = generateApiKeyMaterial();
    expect(material.plaintext.startsWith('pfk_')).toBe(true);
    expect(material.keyPrefix).toHaveLength(API_KEY_PREFIX_LENGTH);
    expect(material.keyPrefix).toBe(extractKeyPrefix(material.plaintext));
    expect(material.keyHash).toBe(hashSecret(material.plaintext));
    expect(material.keyHash).not.toBe(material.plaintext);
    expect(isSha256HexDigest(material.keyHash)).toBe(true);
  });

  it('compares hashes with constant-time equality', () => {
    const hash = hashSecret('pfk_test');
    expect(secretsEqual(hash, hash)).toBe(true);
    expect(secretsEqual(hash, hashSecret('other'))).toBe(false);
  });

  it('identifies valid key shape before lookup', () => {
    const material = generateApiKeyMaterial();
    expect(looksLikeApiKey(material.plaintext)).toBe(true);
    expect(looksLikeApiKey('pfk_short')).toBe(false);
    expect(looksLikeApiKey('other_token')).toBe(false);
  });

  it('rejects prefix extraction when key is too short', () => {
    expect(() => extractKeyPrefix('pfk_')).toThrow(/too short/);
  });

  it('requires known scopes and uuid client on create', () => {
    expect(
      createApiKeySchema.safeParse({
        apiClientId: '00000000-0000-4000-8000-000000000001',
        name: 'CI',
        scopes: ['projects.read'],
      }).success,
    ).toBe(true);
    expect(
      createApiKeySchema.safeParse({
        apiClientId: 'not-a-uuid',
        name: 'CI',
        scopes: ['projects.read'],
      }).success,
    ).toBe(false);
    expect(
      createApiKeySchema.safeParse({
        apiClientId: '00000000-0000-4000-8000-000000000001',
        name: 'CI',
        scopes: ['admin.everything'],
      }).success,
    ).toBe(false);
  });

  it('validates rotate input', () => {
    expect(
      rotateApiKeySchema.safeParse({
        keyId: '00000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(true);
    expect(rotateApiKeySchema.safeParse({ keyId: 'bad' }).success).toBe(false);
  });
});

describe('webhook secret material', () => {
  it('hashes webhook secrets and never equates plaintext to hash', () => {
    const material = generateWebhookSecretMaterial();
    expect(material.plaintext.startsWith('whsec_')).toBe(true);
    expect(material.secretHash).toBe(hashSecret(material.plaintext));
    expect(material.secretHash).not.toBe(material.plaintext);
    expect(isSha256HexDigest(material.secretHash)).toBe(true);
  });
});
