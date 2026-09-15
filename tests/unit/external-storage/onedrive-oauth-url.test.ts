import { describe, expect, it } from 'vitest';
import {
  assertMicrosoftClientSecretConfigured,
  buildOneDriveAuthorizationUrl,
  buildOneDriveTokenBody,
  formatOneDriveOAuthScope,
  looksLikeMicrosoftClientSecretId,
  ONEDRIVE_OAUTH_SCOPES,
  resolveOneDriveOAuthAuthorizeOptions,
} from '@/modules/external-storage/providers/onedrive-oauth-url';

describe('OneDrive OAuth URL', () => {
  it('includes all required authorize query parameters with scope', () => {
    const url = buildOneDriveAuthorizationUrl({
      tenant: 'common',
      clientId: 'client-id-test',
      redirectUri: 'http://localhost:3100/api/org-storage/oauth/onedrive/callback',
      state: 'state-token',
    });
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(parsed.searchParams.get('client_id')).toBe('client-id-test');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3100/api/org-storage/oauth/onedrive/callback',
    );
    expect(parsed.searchParams.get('response_mode')).toBe('query');
    expect(parsed.searchParams.get('scope')).toBe(formatOneDriveOAuthScope());
    expect(parsed.searchParams.get('state')).toBe('state-token');
    expect(parsed.searchParams.get('scope')).toBe(ONEDRIVE_OAUTH_SCOPES.join(' '));
    expect(parsed.searchParams.get('login_hint')).toBeNull();
  });

  it('resolveOneDriveOAuthAuthorizeOptions uses select_account without login_hint', () => {
    expect(resolveOneDriveOAuthAuthorizeOptions()).toEqual({
      prompt: 'select_account',
      loginHint: null,
    });
    const url = buildOneDriveAuthorizationUrl({
      tenant: 'common',
      clientId: 'client-id-test',
      redirectUri: 'http://localhost:3100/api/org-storage/oauth/onedrive/callback',
      state: 'state-token',
      ...resolveOneDriveOAuthAuthorizeOptions(),
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('prompt')).toBe('select_account');
    expect(parsed.searchParams.get('login_hint')).toBeNull();
    expect(parsed.searchParams.get('client_id')).toBe('client-id-test');
    expect(url).not.toMatch(/%0[aAdD]/);
  });

  it('includes login_hint when provided', () => {
    const url = buildOneDriveAuthorizationUrl({
      tenant: 'common',
      clientId: 'client-id-test',
      redirectUri: 'http://localhost:3100/api/org-storage/oauth/onedrive/callback',
      state: 'state-token',
      loginHint: 'owner@example.com',
    });
    expect(new URL(url).searchParams.get('login_hint')).toBe('owner@example.com');
  });

  it('includes scope on token exchange body', () => {
    const body = buildOneDriveTokenBody({
      clientId: 'client-id-test',
      clientSecret: 'real-secret-value-not-a-uuid',
      grantType: 'authorization_code',
      code: 'auth-code',
      redirectUri: 'http://localhost:3100/api/org-storage/oauth/onedrive/callback',
    });

    expect(body.get('scope')).toBe(formatOneDriveOAuthScope());
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
  });

  it('rejects Entra secret IDs masquerading as client secrets', () => {
    expect(looksLikeMicrosoftClientSecretId('97fc0000-0000-4000-8000-000000002bbd')).toBe(true);
    expect(() =>
      assertMicrosoftClientSecretConfigured('97fc0000-0000-4000-8000-000000002bbd'),
    ).toThrow(/Secret ID/);
  });
});
