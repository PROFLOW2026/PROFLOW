import { describe, expect, it } from 'vitest';
import { marketingScreenshotSrc } from '@/modules/marketing/domain/marketing-screenshots';

describe('marketingScreenshotSrc', () => {
  it('maps known locales to folder paths', () => {
    expect(marketingScreenshotSrc('en', 'today-desktop.png')).toBe(
      '/marketing/screenshots/en/today-desktop.png',
    );
    expect(marketingScreenshotSrc('he-IL', 'billing-desktop.png')).toBe(
      '/marketing/screenshots/he-IL/billing-desktop.png',
    );
  });

  it('falls back to he-IL for unknown locale codes', () => {
    expect(marketingScreenshotSrc('fr', 'today-desktop.png')).toBe(
      '/marketing/screenshots/he-IL/today-desktop.png',
    );
  });
});
