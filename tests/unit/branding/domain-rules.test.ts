import { describe, expect, it } from 'vitest';
import {
  assertVisibleBrandColor,
  contrastTextOnBrand,
  isValidBrandHex,
  normalizeBrandHex,
} from '@/modules/branding/domain/colors';
import {
  assertBrandAssetConstraints,
  normalizeBrandAssetMime,
} from '@/modules/branding/domain/logo-rules';
import { sanitizeBrandPlainText, sanitizeOptionalBrandText } from '@/modules/branding/domain/sanitize-text';
import { DomainRuleError } from '@/shared/errors';

describe('brand colors', () => {
  it('normalizes and validates hex', () => {
    expect(isValidBrandHex('#0f766e')).toBe(true);
    expect(normalizeBrandHex('#0f766e')).toBe('#0F766E');
    expect(isValidBrandHex('teal')).toBe(false);
  });

  it('rejects near-white brand colors on paper', () => {
    expect(() => assertVisibleBrandColor('#FFFFFF')).toThrow(DomainRuleError);
    expect(assertVisibleBrandColor('#0F766E')).toBe('#0F766E');
  });

  it('picks contrast text for brand primary', () => {
    expect(contrastTextOnBrand('#0F766E')).toBe('#FFFFFF');
    expect(contrastTextOnBrand('#FDE68A')).toBe('#000000');
  });
});

describe('brand logo rules', () => {
  it('allows png jpeg webp and rejects svg', () => {
    expect(normalizeBrandAssetMime('image/png', 'logo.png')).toBe('image/png');
    expect(normalizeBrandAssetMime('image/jpeg', 'logo.jpg')).toBe('image/jpeg');
    expect(normalizeBrandAssetMime('image/webp', 'logo.webp')).toBe('image/webp');
    expect(() => normalizeBrandAssetMime('image/svg+xml', 'logo.svg')).toThrow(DomainRuleError);
    expect(() => normalizeBrandAssetMime('image/png', 'logo.svg')).toThrow(DomainRuleError);
  });

  it('enforces size limits', () => {
    expect(() =>
      assertBrandAssetConstraints({ mimeType: 'image/png', sizeBytes: 0, fileName: 'a.png' }),
    ).toThrow(DomainRuleError);
    expect(
      assertBrandAssetConstraints({
        mimeType: 'image/png',
        sizeBytes: 1024,
        fileName: 'a.png',
      }).mimeType,
    ).toBe('image/png');
  });
});

describe('brand plain text sanitize', () => {
  it('strips tags and script-like content', () => {
    expect(sanitizeBrandPlainText('<script>alert(1)</script>Hello')).toBe('Hello');
    expect(sanitizeBrandPlainText('&lt;b&gt;Terms&lt;/b&gt;')).toBe('Terms');
    expect(sanitizeOptionalBrandText('  ')).toBeNull();
  });
});
