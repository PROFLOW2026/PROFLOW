import { handleExternalEvidenceDownload } from '@/modules/evidence/routes';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await context.params;
  return handleExternalEvidenceDownload(request, evidenceId);
}
