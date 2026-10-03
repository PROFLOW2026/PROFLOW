import { handleExternalSharedDocumentDownload } from '@/modules/project-plans/routes';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ shareId: string }> },
) {
  const { shareId } = await context.params;
  return handleExternalSharedDocumentDownload(request, shareId);
}
