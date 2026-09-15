import { describe, expect, it } from 'vitest';
import {
  formatGoogleDriveOAuthScope,
  googleDriveGrantedFullScope,
  googleDriveNeedsConsentForReconnect,
  GOOGLE_DRIVE_FULL_SCOPE,
  resolveGoogleDriveOAuthAuthorizeOptions,
} from '@/modules/external-storage/providers/google-drive-oauth-url';

describe('Google Drive OAuth URL helpers', () => {
  it('formatGoogleDriveOAuthScope includes full drive and email', () => {
    expect(formatGoogleDriveOAuthScope()).toBe(
      'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email',
    );
  });

  it('googleDriveGrantedFullScope detects full drive grant', () => {
    expect(googleDriveGrantedFullScope([GOOGLE_DRIVE_FULL_SCOPE])).toBe(true);
    expect(
      googleDriveGrantedFullScope(['https://www.googleapis.com/auth/drive.file']),
    ).toBe(false);
  });

  it('requires consent after error or insufficient prior scopes', () => {
    expect(
      googleDriveNeedsConsentForReconnect({
        connectionStatus: 'error',
        priorScopes: [],
        priorRefreshTokenPresent: false,
      }),
    ).toBe(true);

    expect(
      googleDriveNeedsConsentForReconnect({
        connectionStatus: 'connected',
        priorScopes: ['https://www.googleapis.com/auth/drive.file'],
        priorRefreshTokenPresent: true,
      }),
    ).toBe(true);

    expect(
      googleDriveNeedsConsentForReconnect({
        connectionStatus: 'connected',
        priorScopes: [GOOGLE_DRIVE_FULL_SCOPE],
        priorRefreshTokenPresent: true,
        lastError: 'provision: ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      }),
    ).toBe(true);
  });

  it('uses select_account for first connect without prior scopes', () => {
    expect(
      resolveGoogleDriveOAuthAuthorizeOptions({
        connectionStatus: 'disconnected',
        priorScopes: [],
        priorRefreshTokenPresent: false,
      }),
    ).toEqual({ prompt: 'select_account', loginHint: null });
  });

  it('uses consent when reconnecting after scope upgrade', () => {
    expect(
      resolveGoogleDriveOAuthAuthorizeOptions({
        connectionStatus: 'error',
        priorScopes: ['https://www.googleapis.com/auth/drive.file'],
        priorRefreshTokenPresent: true,
        lastError: 'provision: ACCESS_TOKEN_SCOPE_INSUFFICIENT',
      }),
    ).toEqual({ prompt: 'consent', loginHint: null });
  });
});
