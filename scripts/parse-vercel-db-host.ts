import fs from 'node:fs';
import dotenv from 'dotenv';

const file = process.argv[2] ?? '.env.vercel.production.tmp';
const parsed = dotenv.parse(fs.readFileSync(file));
const raw = parsed.DATABASE_URL ?? '';

function classify(host: string, port: string): string {
  const p = port || '5432';
  if (host.includes('pooler.supabase.com')) {
    return p === '6543' ? 'transaction-pooler' : 'session-pooler';
  }
  if (host.startsWith('db.') && host.endsWith('.supabase.co')) return 'direct-primary';
  if (host === '127.0.0.1' || host === 'localhost') return 'local-harness';
  return 'unknown';
}

let databaseUrl: Record<string, unknown> = { configured: false };
if (raw.trim()) {
  try {
    const u = new URL(raw.replace(/^postgresql:/, 'http:'));
    databaseUrl = {
      configured: true,
      connectionType: classify(u.hostname, u.port),
      hostPattern: u.hostname.replace(/^[^.]+/, '*'),
      port: u.port || '5432',
    };
  } catch {
    databaseUrl = { configured: true, parseError: true };
  }
}

console.log(
  JSON.stringify(
    {
      source: 'vercel-production-env-isolated',
      databaseUrl,
      hasDirectDatabaseUrl: Boolean(parsed.DIRECT_DATABASE_URL?.trim()),
    },
    null,
    2,
  ),
);

if (process.argv.includes('--cleanup')) {
  fs.unlinkSync(file);
}
