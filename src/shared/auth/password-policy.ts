/**
 * Shared account password policy for signup / password reset.
 * Sign-in must not enforce this minimum (existing accounts may differ).
 *
 * Supabase Auth defaults to a lower floor (typically 6); the product floor is 8.
 */
export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}
