import { describe, expect, it } from 'vitest';
import {
  generateTemporaryPin,
  isValidPin,
  MAX_LOGIN_ATTEMPTS,
  TEMP_PIN_TTL_MS,
  pinExpiryFromNow,
} from '@/modules/employee-app/domain/pin';

describe('employee app PIN', () => {
  it('accepts 6-digit PINs only', () => {
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12ab56')).toBe(false);
  });

  it('generates 6-digit temporary PIN', () => {
    const pin = generateTemporaryPin();
    expect(isValidPin(pin)).toBe(true);
  });

  it('temporary PIN expires in 24 hours by default', () => {
    const now = Date.parse('2026-01-01T12:00:00.000Z');
    const expiry = pinExpiryFromNow(now);
    expect(expiry.getTime() - now).toBe(TEMP_PIN_TTL_MS);
  });

  it('defines practical login lock thresholds', () => {
    expect(MAX_LOGIN_ATTEMPTS).toBeGreaterThanOrEqual(3);
  });
});
