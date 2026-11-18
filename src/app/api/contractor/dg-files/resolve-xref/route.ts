import { requireExternalContext } from '@/modules/contractor-access';
import { resolveContractorFolderXref } from '@/modules/contractor-portal/application/contractor-folder-files';
import { capabilityForContractorFolder } from '@/modules/contractor-portal/domain/folder-capabilities';
import type { SemanticFolderType } from '@/modules/external-storage/domain/types';
import { apiRouteErrorFromUnknown } from '@/shared/errors';

export const runtime = 'nodejs';

const ALLOWED_FOLDERS = new Set<string>([
  'plans',
  'quotes',
  'contracts',
  'billing',
  'vendor_invoices',
  'photos',
  'documents',
  'general_files',
]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId');
    const projectId = url.searchParams.get('projectId');
    const folderParam = url.searchParams.get('folder');
    const externalFileId = url.searchParams.get('externalFileId');
    const xrefPath = url.searchParams.get('path');
    const anchorPath = url.searchParams.get('anchor');
    if (!organizationId || !projectId || !folderParam || !externalFileId || !xrefPath) {
      return new Response(null, { status: 400 });
    }
    if (!ALLOWED_FOLDERS.has(folderParam)) return new Response(null, { status: 404 });
    const folder = folderParam as SemanticFolderType;
    if (!capabilityForContractorFolder(folder)) return new Response(null, { status: 404 });
    const context = await requireExternalContext();
    const resolved = await resolveContractorFolderXref(context, {
      organizationId,
      projectId,
      folder,
      externalFileId,
      xrefPath,
      anchorPath,
    });
    if (!resolved) return new Response(null, { status: 404 });
    if ('error' in resolved) {
      const body =
        resolved.error.status === 'ambiguous'
          ? {
              status: resolved.error.status,
              candidates: resolved.error.candidates.map((row) => ({
                name: row.name,
                relativeFolder: row.relativeFolder,
              })),
            }
          : { status: resolved.error.status, reason: 'reason' in resolved.error ? resolved.error.reason : 'error' };
      return Response.json(body, { status: resolved.httpStatus, headers: { 'Cache-Control': 'private, no-store' } });
    }
    return Response.json(resolved, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}
