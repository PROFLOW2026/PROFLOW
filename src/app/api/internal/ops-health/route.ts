import { NextResponse } from 'next/server';
import { loadOpsHealthSnapshot } from '@/modules/ops/application/ops-health-readmodel';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

export async function GET(request: Request): Promise<Response> {
  if (!isInternalWorkerAuthorized(request, 'ops-worker')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const health = await loadOpsHealthSnapshot();
  return NextResponse.json({ health });
}
