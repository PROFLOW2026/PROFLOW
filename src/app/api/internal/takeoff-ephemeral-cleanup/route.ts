import { NextResponse } from 'next/server';
import { purgeExpiredEphemeralTakeoffs } from '@/modules/electrical-takeoff/application/purge-ephemeral-takeoff';
import { getAdminDb } from '@/shared/db/client';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

export async function POST(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request, 'ops-worker')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const purged = await purgeExpiredEphemeralTakeoffs(getAdminDb());
  return NextResponse.json({ purged });
}