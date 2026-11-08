/**
 * External signup outcome.
 *
 * A new address that still needs email confirmation and an address that is
 * already registered must look the same. Password and email-format failures
 * stay specific because they do not reveal whether an account exists.
 * An existing account is never signed in through signup.
 */

export const SIGN_UP_CHECK_EMAIL_NOTICE = 'check-email' as const;

export type SignUpProviderErrorKey = 'passwordTooWeak' | 'invalidEmail' | 'failed';

export type SignUpProviderOutcome =
  | { readonly notice: typeof SIGN_UP_CHECK_EMAIL_NOTICE }
  | { readonly errorKey: SignUpProviderErrorKey };

export function signUpOutcomeForProviderError(
  message: string,
  code: string | undefined,
): SignUpProviderOutcome {
  if (isExistingEmailSignal(message, code)) {
    return { notice: SIGN_UP_CHECK_EMAIL_NOTICE };
  }
  const lower = message.toLowerCase();
  if (
    lower.includes('password') &&
    (lower.includes('short') || lower.includes('least') || lower.includes('weak'))
  ) {
    return { errorKey: 'passwordTooWeak' };
  }
  if (lower.includes('email') && (lower.includes('invalid') || lower.includes('valid'))) {
    return { errorKey: 'invalidEmail' };
  }
  return { errorKey: 'failed' };
}

function isExistingEmailSignal(message: string, code: string | undefined): boolean {
  if (code === 'user_already_exists' || code === 'email_exists') return true;
  const lower = message.toLowerCase();
  return lower.includes('already') || lower.includes('registered') || lower.includes('exists');
}

/**
 * New confirmation-pending signups and already-registered addresses both
 * surface as check-email. A genuine new session still proceeds.
 */
export function signUpConfirmationNotice(input: {
  readonly hasSession: boolean;
  readonly identityCount: number | null;
}): 'check-email' | 'session' {
  if (input.identityCount === 0) return 'check-email';
  if (!input.hasSession) return 'check-email';
  return 'session';
}
