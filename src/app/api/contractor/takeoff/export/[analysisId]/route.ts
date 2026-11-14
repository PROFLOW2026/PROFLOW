import type { ExportKind } from '@/modules/electrical-takeoff/domain/contracts';
import { handleExternalExportDownload } from '@/modules/electrical-takeoff/routes';

export const runtime = 'nodejs';

const KINDS = new Set<ExportKind>(['xlsx', 'boq-pdf', 'annotated-pdf']);

async function exportHandler(request: Request, analysisId: string): Promise<Response> {
  const kind = new URL(request.url).searchParams.get('kind') ?? 'xlsx';
  if (!KINDS.has(kind as ExportKind)) return new Response(null, { status: 400 });
  return handleExternalExportDownload(request, analysisId, kind as ExportKind);
}

export async function GET(request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  return exportHandler(request, analysisId);
}

export async function HEAD(request: Request, context: { params: Promise<{ analysisId: string }> }) {
  const { analysisId } = await context.params;
  return exportHandler(request, analysisId);
}