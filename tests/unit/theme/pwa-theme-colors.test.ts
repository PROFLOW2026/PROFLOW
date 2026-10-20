import { describe, expect, it } from 'vitest';
import {
  pwaColorsForPreference,
  pwaColorsForResolved,
  pwaManifestColors,
} from '@/shared/theme/pwa-theme-colors';

describe('pwa theme colors', () => {
  it('maps resolved light and dark', () => {
    expect(pwaColorsForResolved('light').themeColor).toBe('#0f766e');
    expect(pwaColorsForResolved('dark').themeColor).toBe('#151d2b');
  });

  it('manifest uses light splash for system preference', () => {
    expect(pwaManifestColors('system').backgroundColor).toBe('#f4f6f8');
  });

  it('follows explicit preference for runtime chrome', () => {
    expect(pwaColorsForPreference('dark', false).themeColor).toBe('#151d2b');
    expect(pwaColorsForPreference('light', true).themeColor).toBe('#0f766e');
  });
});
