/**
 * Preflight check for Google Drive OAuth env + authorize URL shape.
 * Does not call Google APIs or print secrets.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const clientId = process.env.GOOGLE_STORAGE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_STORAGE_CLIENT_SECRET?.trim();
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const redirectUri = `${appUrl}/api/org-storage/oauth/google_drive/callback`;

const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

const params = new URLSearchParams({
  client_id: clientId ?? 'MISSING',
  redirect_uri: redirectUri,
  response_type: 'code',
  scope: scopes,
  state: 'preflight',
  access_type: 'offline',
  prompt: 'select_account',
});

const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

const report = {
  ok: Boolean(clientId && clientSecret),
  env: {
    GOOGLE_STORAGE_CLIENT_ID: clientId ? `${clientId.slice(0, 8)}…` : 'MISSING',
    GOOGLE_STORAGE_CLIENT_SECRET: clientSecret ? 'SET (redacted)' : 'MISSING',
    APP_URL: appUrl,
    STORAGE_TOKEN_ENCRYPTION_KEY: process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim()
      ? 'SET (redacted)'
      : 'MISSING',
  },
  oauth: {
    authorizeEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: scopes.split(' '),
    redirectUri,
    prompt: 'select_account',
    accessType: 'offline',
  },
  driveApi: {
    base: 'https://www.googleapis.com/drive/v3',
    upload: 'https://www.googleapis.com/upload/drive/v3',
    requiredApiEnabled: 'Google Drive API (console.cloud.google.com)',
  },
  authorizeUrlPreview: clientId
    ? authorizeUrl.replace(clientId, `${clientId.slice(0, 8)}…`)
    : '(set GOOGLE_STORAGE_CLIENT_ID to preview)',
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
