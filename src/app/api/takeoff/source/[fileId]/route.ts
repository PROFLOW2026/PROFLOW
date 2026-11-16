import { handleInternalSourceDownload } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;
  return handleInternalSourceDownload(request, fileId);
}
