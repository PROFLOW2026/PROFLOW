import { describe, expect, it } from 'vitest';
import {
  connectionCodesEqual,
  generateConnectionCode,
  hashConnectionCode,
  isPlausibleConnectionCode,
} from '@/modules/connected-projects/domain/connection-code';

describe('connection codes', () => {
  it('generates plausible codes and stable sha256 hashes', () => {
    const code = generateConnectionCode();
    expect(isPlausibleConnectionCode(code)).toBe(true);
    const hash = hashConnectionCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(connectionCodesEqual(hash, code)).toBe(true);
    expect(connectionCodesEqual(hash, `${code}x`)).toBe(false);
  });
});
