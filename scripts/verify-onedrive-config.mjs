import { config } from 'dotenv';

config({ path: '.env.local' });

const APP_URL = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const required = [
  'DATABASE_URL',
  'MICROSOFT_STORAGE_CLIENT_ID',
  'MICROSOFT_STORAGE_CLIENT_SECRET',
  'STORAGE_TOKEN_ENCRYPTION_KEY',
];

const missing = required.filter((k) => !process.env[k]?.trim());
const redirectUri = `${APP_URL}/api/org-storage/oauth/onedrive/callback`;
const secret = process.env.MICROSOFT_STORAGE_CLIENT_SECRET?.trim() ?? '';
const secretLooksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret);

let tokenProbe = null;
if (!missing.length && !secretLooksLikeId) {
  const tenant = process.env.MICROSOFT_STORAGE_TENANT_ID || 'common';
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_STORAGE_CLIENT_ID,
    client_secret: secret,
    code: 'probe-invalid-code',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'offline_access User.Read Files.ReadWrite',
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  tokenProbe = text.includes('7000215')
    ? 'INVALID_CLIENT_SECRET'
    : text.includes('9002313') || text.includes('invalid_grant')
      ? 'SECRET_ACCEPTED'
      : 'UNKNOWN';
}

console.log(
  JSON.stringify(
    {
      appUrl: APP_URL,
      redirectUri,
      tenant: process.env.MICROSOFT_STORAGE_TENANT_ID || 'common',
      missingEnv: missing,
      secretLooksLikeEntraSecretId: secretLooksLikeId,
      tokenProbe,
      scopes: ['offline_access', 'User.Read', 'Files.ReadWrite'],
    },
    null,
    2,
  ),
);
