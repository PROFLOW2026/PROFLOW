/**
 * Parses DATABASE_URL host/port (no credentials) for connection-path classification.
 * Run: npx tsx scripts/inspect-db-connection-path.ts
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });

function classifyHost(host: string, port: string): {
  connectionType: 'direct-primary' | 'session-pooler' | 'transaction-pooler' | 'unknown';
  hostPattern: string;
  port: string;
} {
  const normalizedPort = port || '5432';
  if (host.includes('pooler.supabase.com')) {
    return {
      connectionType: normalizedPort === '6543' ? 'transaction-pooler' : 'session-pooler',
      hostPattern: host.replace(/^[a-z0-9-]+\./, '*.'),
      port: normalizedPort,
    };
  }
  if (host.startsWith('db.') && host.endsWith('.supabase.co')) {
    return {
      connectionType: 'direct-primary',
      hostPattern: 'db.*.supabase.co',
      port: normalizedPort,
    };
  }
  return { connectionType: 'unknown', hostPattern: host, port: normalizedPort };
}

function parseUrl(raw: string | undefined): ReturnType<typeof classifyHost> | null {
  if (!raw?.trim()) return null;
  try {
    const normalized = raw.replace(/^postgresql:/, 'http:');
    const url = new URL(normalized);
    return classifyHost(url.hostname, url.port);
  } catch {
    return null;
  }
}

const database = parseUrl(process.env.DATABASE_URL);
const direct = parseUrl(process.env.DIRECT_DATABASE_URL);

console.log(
  JSON.stringify(
    {
      source: 'local-env',
      databaseUrl: database,
      directDatabaseUrl: direct,
      runtimeUses: 'DATABASE_URL via getDb()',
      adminUses: 'DIRECT_DATABASE_URL ?? DATABASE_URL via getAdminDb()',
      driver: 'postgres.js',
      prepare: false,
    },
    null,
    2,
  ),
);
