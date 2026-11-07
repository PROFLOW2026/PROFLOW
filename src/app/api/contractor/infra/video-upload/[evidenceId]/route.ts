import { handleExternalVideoChunk } from '@/modules/infra-mapping/routes';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await context.params;
  return handleExternalVideoChunk(request, evidenceId);
}
