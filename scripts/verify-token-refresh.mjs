/**
 * Verify OneDrive refresh-token flow and DB persistence (no OAuth).
 * node scripts/verify-token-refresh.mjs
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createDecipheriv, createCipheriv, createHash, randomBytes } from 'node:crypto';

config({ path: '.env.local' });

const CONNECTION = 'ee41c00b-436f-4772-bc09-c173c7f5d9fd';
const ORG = '7dec19cf-ef7a-4f62-a110-615da62f3823';

function resolveKek() {
  const e = process.env.STORAGE_TOKEN_ENCRYPTION_KEY?.trim();
  if (/^[0-9a-fA-F]{64}$/.test(e ?? '')) return Buffer.from(e, 'hex');
  return createHash('sha256')
    .update('projectflow.storage.token.kek.v1\0', 'utf8')
    .update(e, 'utf8')
    .digest();
}

function openSealed(sealed) {
  const prefix = 'enc:v1:';
  const rest = sealed.slice(prefix.length);
  const [ivB64, tagB64, ctB64] = rest.split(':');
  const d = createDecipheriv('aes-256-gcm', resolveKek(), Buffer.from(ivB64, 'base64url'));
  d.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(ctB64, 'base64url')), d.final()]).toString('utf8'),
  );
}

function sealPayload(payload) {
  const key = resolveKek();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const before = (
  await sql`
    SELECT credentials_ref, token_expires_at
    FROM app.storage_connection_credential_refs
    WHERE connection_id = ${CONNECTION}::uuid LIMIT 1
  `
)[0];
const payload = openSealed(before.credentials_ref);
const expired = before.token_expires_at
  ? Date.parse(before.token_expires_at) <= Date.now() + 60_000
  : true;

console.log('Before:', {
  tokenExpiresAt: before.token_expires_at,
  expired,
  hasRefreshToken: Boolean(payload.refreshToken),
});

if (!payload.refreshToken) {
  console.error('FAIL — no refresh token stored');
  process.exit(1);
}

const tenant = process.env.MICROSOFT_STORAGE_TENANT_ID?.trim() || 'common';
const body = new URLSearchParams({
  client_id: process.env.MICROSOFT_STORAGE_CLIENT_ID,
  client_secret: process.env.MICROSOFT_STORAGE_CLIENT_SECRET,
  grant_type: 'refresh_token',
  refresh_token: payload.refreshToken,
  scope: 'offline_access Files.ReadWrite User.Read',
});

const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body,
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok) {
  console.error('TOKEN REFRESH = FAIL', tokenBody);
  process.exit(1);
}

const newExpiresAt = tokenBody.expires_in
  ? new Date(Date.now() + tokenBody.expires_in * 1000)
  : null;
const newPayload = {
  accessToken: tokenBody.access_token,
  refreshToken: tokenBody.refresh_token ?? payload.refreshToken,
  expiresAt: newExpiresAt?.toISOString() ?? null,
  scopes: (tokenBody.scope ?? '').split(' ').filter(Boolean),
};
const sealed = sealPayload(newPayload);

await sql`
  UPDATE app.storage_connection_credential_refs
  SET credentials_ref = ${sealed}, token_expires_at = ${newExpiresAt}, updated_at = now()
  WHERE connection_id = ${CONNECTION}::uuid
`;
await sql`
  UPDATE organization_storage_connections
  SET token_expires_at = ${newExpiresAt}, last_validated_at = now(), status = 'connected', last_error = null, updated_at = now()
  WHERE id = ${CONNECTION}::uuid AND organization_id = ${ORG}::uuid
`;

const graphRes = await fetch('https://graph.microsoft.com/v1.0/me/drive?$select=id,quota', {
  headers: { Authorization: `Bearer ${tokenBody.access_token}` },
});
const graphBody = await graphRes.json();

const after = (
  await sql`
    SELECT token_expires_at FROM app.storage_connection_credential_refs
    WHERE connection_id = ${CONNECTION}::uuid LIMIT 1
  `
)[0];

await sql.end();

const passRefresh = tokenRes.ok;
const passPersist = after.token_expires_at && Date.parse(after.token_expires_at) > Date.now();
const passRetry = graphRes.ok;

console.log('\nTOKEN REFRESH =', passRefresh ? 'PASS' : 'FAIL');
console.log('NEW EXPIRY PERSISTED =', passPersist ? `PASS (${after.token_expires_at})` : 'FAIL');
console.log('PROVIDER REQUEST RETRY =', passRetry ? `PASS (drive id ${graphBody.id ?? 'n/a'})` : `FAIL (${graphBody.error?.code ?? graphRes.status})`);
process.exit(passRefresh && passPersist && passRetry ? 0 : 1);
