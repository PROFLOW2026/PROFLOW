import { handleInternalRevisionDownload } from '@/modules/project-plans/routes';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  const { revisionId } = await context.params;
  return handleInternalRevisionDownload(request, revisionId);
}
