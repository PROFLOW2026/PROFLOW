/** Entra "Secret ID" UUIDs are not valid client_secret values for token exchange. */
export function looksLikeMicrosoftClientSecretId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function assertMicrosoftClientSecretConfigured(secret: string | undefined): string {
  const trimmed = secret?.trim();
  if (!trimmed) {
    throw new Error('MICROSOFT_STORAGE_CLIENT_SECRET is not configured');
  }
  if (looksLikeMicrosoftClientSecretId(trimmed)) {
    throw new Error(
      'MICROSOFT_STORAGE_CLIENT_SECRET looks like an Entra Secret ID (UUID). Use the secret Value from Certificates & secrets.',
    );
  }
  return trimmed;
}

/** Microsoft Graph delegated scopes for OneDrive storage (v2 authorize + token). */
export const ONEDRIVE_OAUTH_SCOPES = [
  'offline_access',
  'User.Read',
  'Files.ReadWrite',
] as const;

export function formatOneDriveOAuthScope(): string {
  return ONEDRIVE_OAUTH_SCOPES.join(' ');
}

export function buildOneDriveAuthorizationUrl(input: {
  tenant: string;
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string | null;
  prompt?: 'select_account' | 'login' | 'consent' | null;
}): string {
  const params = new URLSearchParams();
  params.set('client_id', input.clientId);
  params.set('response_type', 'code');
  params.set('redirect_uri', input.redirectUri);
  params.set('response_mode', 'query');
  params.set('scope', formatOneDriveOAuthScope());
  params.set('state', input.state);
  const loginHint = input.loginHint?.trim();
  if (loginHint) {
    params.set('login_hint', loginHint);
  }
  const prompt = input.prompt?.trim();
  if (prompt) {
    params.set('prompt', prompt);
  }

  const tenant = input.tenant.trim() || 'common';
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export function buildOneDriveTokenBody(input: {
  clientId: string;
  clientSecret: string;
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  refreshToken?: string;
  redirectUri?: string;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client_id', input.clientId);
  body.set('client_secret', assertMicrosoftClientSecretConfigured(input.clientSecret));
  body.set('grant_type', input.grantType);
  body.set('scope', formatOneDriveOAuthScope());

  if (input.grantType === 'authorization_code') {
    if (!input.code || !input.redirectUri) {
      throw new Error('authorization_code exchange requires code and redirectUri');
    }
    body.set('code', input.code);
    body.set('redirect_uri', input.redirectUri);
  } else {
    if (!input.refreshToken) {
      throw new Error('refresh_token exchange requires refreshToken');
    }
    body.set('refresh_token', input.refreshToken);
  }

  return body;
}
