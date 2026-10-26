import { describe, expect, it } from 'vitest';
import {
  pwaColorsForPreference,
  pwaColorsForResolved,
  pwaManifestColors,
} from '@/shared/theme/pwa-theme-colors';

describe('pwa theme colors', () => {
  it('maps resolved light and dark', () => {
    expect(pwaColorsForResolved('light').themeColor).toBe('#0f766e');
    expect(pwaColorsForResolved('dark').themeColor).toBe('#252d3d');
  });

  it('manifest uses brand teal splash for install (independent of page chrome)', () => {
    expect(pwaManifestColors('system').backgroundColor).toBe('#0f766e');
    expect(pwaManifestColors('dark').backgroundColor).toBe('#0f766e');
  });

  it('follows explicit preference for runtime chrome', () => {
    expect(pwaColorsForPreference('dark', false).themeColor).toBe('#252d3d');
    expect(pwaColorsForPreference('light', true).themeColor).toBe('#0f766e');
  });
});
