import { handleInternalTakeoffUpload } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function PUT(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await context.params;
  return handleInternalTakeoffUpload(request, fileId);
}