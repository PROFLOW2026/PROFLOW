import { handleInternalInfraUpload } from '@/modules/infra-mapping/routes';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const { evidenceId } = await context.params;
  return handleInternalInfraUpload(request, evidenceId);
}
