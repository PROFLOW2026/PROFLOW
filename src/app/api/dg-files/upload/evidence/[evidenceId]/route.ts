import { handleInternalEvidenceUpload } from '@/modules/evidence/routes';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await context.params;
  return handleInternalEvidenceUpload(request, evidenceId);
}
