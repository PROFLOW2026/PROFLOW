/**
 * Strong password policy for contractor accounts (stricter than the owner sign-up floor in
 * `@/shared/auth/password-policy`: contractor accounts are username-only and cannot fall back to an
 * email-verified recovery path).
 */

export const CONTRACTOR_PASSWORD_MIN_LENGTH = 10;
export const CONTRACTOR_PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleViolation =
  | 'too_short'
  | 'too_long'
  | 'needs_variety'
  | 'contains_username'
  | 'too_common'
  | 'mismatch';

const COMMON_PASSWORDS = new Set([
  'password1!',
  'password123',
  'qwerty12345',
  '1234567890',
  'a123456789',
  'abc1234567',
  'iloveyou123',
  'welcome123',
  'projectflow1',
  'contractor1',
]);

function characterClasses(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/[0-9]/.test(password)) classes += 1;
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  return classes;
}

export function checkContractorPassword(input: {
  password: string;
  confirmation?: string;
  username?: string | null;
}): readonly PasswordRuleViolation[] {
  const { password } = input;
  const violations: PasswordRuleViolation[] = [];
  if (password.length < CONTRACTOR_PASSWORD_MIN_LENGTH) violations.push('too_short');
  if (password.length > CONTRACTOR_PASSWORD_MAX_LENGTH) violations.push('too_long');
  if (characterClasses(password) < 3) violations.push('needs_variety');
  const username = input.username?.trim().toLowerCase();
  if (username && username.length >= 3 && password.toLowerCase().includes(username)) {
    violations.push('contains_username');
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) violations.push('too_common');
  if (input.confirmation !== undefined && input.confirmation !== password) violations.push('mismatch');
  return violations;
}

export function isStrongContractorPassword(password: string, username?: string | null): boolean {
  return checkContractorPassword({ password, username }).length === 0;
}
