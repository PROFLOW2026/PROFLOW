import { requireExternalContext } from '@/modules/contractor-access';
import { openContractorFolderProviderFile } from '@/modules/contractor-portal/application/contractor-folder-files';
import { capabilityForContractorFolder } from '@/modules/contractor-portal/domain/folder-capabilities';
import type { SemanticFolderType } from '@/modules/external-storage/domain/types';
import { fileResponse, fileRouteError } from '@/modules/evidence/http';
import { NotFoundError } from '@/shared/errors';

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

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId');
    const projectId = url.searchParams.get('projectId');
    const folderParam = url.searchParams.get('folder');
    const externalFileId = url.searchParams.get('externalFileId');
    if (!organizationId || !projectId || !folderParam || !externalFileId) {
      return new Response(null, { status: 400 });
    }
    if (!ALLOWED_FOLDERS.has(folderParam)) return new Response(null, { status: 404 });
    const folder = folderParam as SemanticFolderType;
    if (!capabilityForContractorFolder(folder)) return new Response(null, { status: 404 });

    const context = await requireExternalContext();
    const file = await openContractorFolderProviderFile(context, {
      organizationId,
      projectId,
      folder,
      externalFileId,
      rangeHeader: request.headers.get('range'),
    });
    const inline = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    return fileResponse(file, inline);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response(null, { status: 404 });
    return fileRouteError(error);
  }
}
