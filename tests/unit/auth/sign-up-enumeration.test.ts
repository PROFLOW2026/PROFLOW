import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SIGN_UP_CHECK_EMAIL_NOTICE,
  signUpConfirmationNotice,
  signUpOutcomeForProviderError,
} from '@/shared/auth/sign-up-outcome';

describe('signup does not reveal whether an email is registered', () => {
  it('returns the same check-email notice for a new unconfirmed signup and an existing email', () => {
    const existingByCode = signUpOutcomeForProviderError(
      'User already registered',
      'user_already_exists',
    );
    const existingByEmailCode = signUpOutcomeForProviderError(
      'A user with this email address has already been registered',
      'email_exists',
    );
    const existingByMessage = signUpOutcomeForProviderError('email address already exists', undefined);
    const pendingConfirmation = signUpConfirmationNotice({
      hasSession: false,
      identityCount: 1,
    });
    const obfuscatedExistingAccount = signUpConfirmationNotice({
      hasSession: true,
      identityCount: 0,
    });

    expect(existingByCode).toEqual({ notice: SIGN_UP_CHECK_EMAIL_NOTICE });
    expect(existingByEmailCode).toEqual({ notice: SIGN_UP_CHECK_EMAIL_NOTICE });
    expect(existingByMessage).toEqual({ notice: SIGN_UP_CHECK_EMAIL_NOTICE });
    expect(pendingConfirmation).toBe(SIGN_UP_CHECK_EMAIL_NOTICE);
    expect(obfuscatedExistingAccount).toBe(SIGN_UP_CHECK_EMAIL_NOTICE);
    expect(existingByCode).toEqual({ notice: pendingConfirmation });
  });

  it('does not sign in an existing account that the provider reports with an empty identity list', () => {
    expect(signUpConfirmationNotice({ hasSession: true, identityCount: 0 })).toBe('check-email');
  });

  it('still allows a genuine new session to continue', () => {
    expect(signUpConfirmationNotice({ hasSession: true, identityCount: 1 })).toBe('session');
  });

  it('keeps password and email-format failures specific', () => {
    expect(signUpOutcomeForProviderError('Password should be at least 8 characters', undefined)).toEqual({
      errorKey: 'passwordTooWeak',
    });
    expect(
      signUpOutcomeForProviderError('Unable to validate email address: invalid format', undefined),
    ).toEqual({ errorKey: 'invalidEmail' });
    expect(signUpOutcomeForProviderError('Signups not allowed for this instance', 'signup_disabled')).toEqual({
      errorKey: 'failed',
    });
  });

  it('wires the signup action to the shared notice and not the registered-email copy', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/app/[locale]/(auth)/actions.ts'), 'utf8');
    expect(source).not.toContain('emailAlreadyRegistered');
    expect(source).toContain('signUpOutcomeForProviderError');
    expect(source).toContain('signUpConfirmationNotice');
    expect(source).toContain("notice: 'check-email'");
  });
});
