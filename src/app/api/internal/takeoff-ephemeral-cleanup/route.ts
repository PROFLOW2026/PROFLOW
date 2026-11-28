import { NextResponse } from 'next/server';
import { purgeExpiredEphemeralTakeoffs } from '@/modules/electrical-takeoff/application/purge-ephemeral-takeoff';
import { getAdminDb } from '@/shared/db/client';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request, 'ops-worker')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const purged = await purgeExpiredEphemeralTakeoffs(getAdminDb());
  let externalTools: { purged: number } | { error: string } = { purged: 0 };
  try {
    const { POST: purgeExternalTools } = await import('../external-tools-cleanup/route');
    const forwarded = new Request(request.url, { method: 'POST', headers: request.headers });
    const response = await purgeExternalTools(forwarded);
    externalTools = (await response.json()) as { purged: number };
  } catch {
    externalTools = { error: 'external_tools_cleanup_failed' };
  }
  return NextResponse.json({ purged, externalTools });
}