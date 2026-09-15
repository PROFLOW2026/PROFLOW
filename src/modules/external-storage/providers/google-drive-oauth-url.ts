import type { StorageConnectionStatus } from '../domain/types';

/** Full Drive access required for ProjectFlow provider-authoritative browsing. */
export const GOOGLE_DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';
export const GOOGLE_DRIVE_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

export function formatGoogleDriveOAuthScope(): string {
  return [GOOGLE_DRIVE_FULL_SCOPE, GOOGLE_DRIVE_EMAIL_SCOPE].join(' ');
}

export function googleDriveGrantedFullScope(scopes: readonly string[]): boolean {
  return scopes.includes(GOOGLE_DRIVE_FULL_SCOPE);
}

export function googleDriveNeedsConsentForReconnect(input: {
  connectionStatus: StorageConnectionStatus;
  priorScopes: readonly string[];
  priorRefreshTokenPresent: boolean;
  lastError?: string | null;
}): boolean {
  const priorScopes = input.priorScopes.filter(Boolean);
  const lacksFullDrive =
    priorScopes.length > 0 && !googleDriveGrantedFullScope(priorScopes);
  const scopeError = /ACCESS_TOKEN_SCOPE_INSUFFICIENT|scope insufficient|full Drive scope/i.test(
    input.lastError ?? '',
  );

  return (
    input.connectionStatus === 'error' ||
    input.connectionStatus === 'reconnect_required' ||
    scopeError ||
    (input.priorRefreshTokenPresent && lacksFullDrive) ||
    lacksFullDrive ||
    (input.connectionStatus === 'connected' && lacksFullDrive)
  );
}

/** Reconnect after scope upgrade or failed grant: force consent once. */
export function resolveGoogleDriveOAuthAuthorizeOptions(input: {
  connectionStatus: StorageConnectionStatus;
  priorScopes: readonly string[];
  priorRefreshTokenPresent: boolean;
  lastError?: string | null;
}): {
  prompt: 'select_account' | 'consent';
  loginHint: string | null;
} {
  if (googleDriveNeedsConsentForReconnect(input)) {
    return { prompt: 'consent', loginHint: null };
  }
  return { prompt: 'select_account', loginHint: null };
}
