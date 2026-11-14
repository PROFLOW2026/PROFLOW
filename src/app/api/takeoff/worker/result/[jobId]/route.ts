import { handleWorkerResult } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return handleWorkerResult(request, jobId);
}