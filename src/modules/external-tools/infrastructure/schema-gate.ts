import 'server-only';

/**
 * The command implementation is ready. This process does not query a database
 * until the Owner has applied migration 0217 and set PF_EXTERNAL_TOOLS_SCHEMA=1
 * on that same non-production target. A missing table stays a 503.
 */
export async function externalSchemaAvailable(): Promise<boolean> {
  if (process.env.PF_EXTERNAL_TOOLS_SCHEMA !== '1') return false;
  try {
    const { getAdminDb } = await import('@/shared/db/client');
    const { sql } = await import('drizzle-orm');
    await getAdminDb().execute(sql`select 1 from public.external_tool_sessions limit 0`);
    return true;
  } catch {
    return false;
  }
}
