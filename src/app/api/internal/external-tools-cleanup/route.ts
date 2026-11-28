import { NextResponse } from 'next/server';
import { externalToolSessions } from '@drizzle/schema';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';
import { getAdminDb } from '@/shared/db/client';
import { externalSchemaAvailable } from '@/modules/external-tools/infrastructure/schema-gate';
import { purgeExternalSessions } from '@/modules/external-tools/infrastructure/postgres-session';

/** Ledger cleanup. Does not touch takeoff_analyses. Independent of PF_EXTERNAL_TOOLS. */
export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request, 'ops-worker')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await externalSchemaAvailable())) {
    return NextResponse.json({ purged: 0, pending: '0217_external_professional_tools' });
  }
  const db = getAdminDb();
  const rows = await db
    .select({ organizationId: externalToolSessions.organizationId })
    .from(externalToolSessions);
  const orgs = [...new Set(rows.map((row) => row.organizationId))];
  let purged = 0;
  let kept = 0;
  for (const organizationId of orgs) {
    const result = await purgeExternalSessions(db, organizationId, new Date());
    purged += result.purged.length;
    kept += result.kept;
  }
  return NextResponse.json({ purged, kept });
}
