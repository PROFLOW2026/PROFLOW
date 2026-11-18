import { handleWorkerXref } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  return handleWorkerXref(request, jobId);
}
