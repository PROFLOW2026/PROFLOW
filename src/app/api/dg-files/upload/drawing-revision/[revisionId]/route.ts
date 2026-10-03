import { handleInternalDrawingRevisionUpload } from '@/modules/project-plans/routes';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  const { revisionId } = await context.params;
  return handleInternalDrawingRevisionUpload(request, revisionId);
}
