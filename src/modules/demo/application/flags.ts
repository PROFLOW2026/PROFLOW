import 'server-only';

export function isDemoEntryEnabled(): boolean {
  return process.env.DEMO_ENTRY_ENABLED === 'true';
}

export function demoCookieSecret(): string | null {
  const secret = process.env.DEMO_SESSION_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  return secret || null;
}
