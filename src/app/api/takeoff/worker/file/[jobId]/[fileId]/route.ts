import { handleWorkerFile } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ jobId: string; fileId: string }> }) {
  const { jobId, fileId } = await context.params;
  return handleWorkerFile(request, jobId, fileId);
}