import { handleArtifactDownload } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await context.params;
  return handleArtifactDownload(request, artifactId);
}