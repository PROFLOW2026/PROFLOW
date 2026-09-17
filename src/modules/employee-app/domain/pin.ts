const PIN_PATTERN = /^\d{6}$/;

export const TEMP_PIN_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

export function generateTemporaryPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function pinExpiryFromNow(now = Date.now()): Date {
  return new Date(now + TEMP_PIN_TTL_MS);
}
