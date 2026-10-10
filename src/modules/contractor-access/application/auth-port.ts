/**
 * Port over Supabase Auth for contractor accounts. Production: `createSupabaseContractorAuthPort()`
 * (`../infrastructure/supabase-auth-port`). Tests: an in-memory fake. Use-cases never import the
 * Supabase SDK directly.
 */

/** Marker in Supabase `app_metadata` (only the service role can set it; users cannot edit it). */
export const CONTRACTOR_APP_METADATA_KEY = 'pf_principal';
export const CONTRACTOR_APP_METADATA_VALUE = 'contractor';

export type ContractorSignInResult =
  | { readonly ok: true; readonly authUserId: string }
  | { readonly ok: false; readonly reason: 'invalid_credentials' | 'auth_error' };

export interface ContractorAuthPort {
  /** Creates a confirmed auth user marked as a contractor. Password is random until activation. */
  createUser(input: { email: string; password: string; displayName: string | null }): Promise<{ authUserId: string }>;
  /** Compensation when the database part of an invite fails. */
  deleteUser(authUserId: string): Promise<void>;
  setPassword(authUserId: string, password: string): Promise<void>;
  /** Updates the synthetic sign-in email when a contractor username changes. */
  updateUserEmail(authUserId: string, email: string): Promise<void>;
  /**
   * Disable = ban in Supabase Auth so no new session can be minted even with the right password.
   * Existing sessions are cut off by `sessions_revoked_at` in the session loader (the admin sign-out
   * API needs the user's own JWT, which the server does not hold).
   */
  setBanned(authUserId: string, banned: boolean): Promise<void>;
  /** Signs in on the CURRENT request (writes the session cookies). */
  signInWithPassword(email: string, password: string): Promise<ContractorSignInResult>;
  /** Verifies a password without touching the current session cookies. */
  verifyPassword(email: string, password: string): Promise<boolean>;
  signOutCurrent(): Promise<void>;
}

export class ContractorAuthNotConfiguredError extends Error {
  constructor() {
    super('Contractor auth is not configured (Supabase URL / service role key missing)');
    this.name = 'ContractorAuthNotConfiguredError';
  }
}
