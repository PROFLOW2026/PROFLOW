import { requireExternalContext } from '@/modules/contractor-access';
import { resolveContractorFolderXrefs } from '@/modules/contractor-portal/application/contractor-folder-files';
import { capabilityForContractorFolder } from '@/modules/contractor-portal/domain/folder-capabilities';
import type { XrefBatchItem } from '@/modules/external-storage/application/resolve-storage-xrefs-batch';
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

type Body = {
  organizationId?: string;
  projectId?: string;
  folder?: string;
  externalFileId?: string;
  items?: XrefBatchItem[];
};

export async function POST(request: Request) {
  try {
    let body: Body;
    try {
      body = (await request.json()) as Body;
    } catch {
      return new Response(null, { status: 400 });
    }
    const organizationId = body.organizationId?.trim();
    const projectId = body.projectId?.trim();
    const folderParam = body.folder?.trim();
    const externalFileId = body.externalFileId?.trim();
    const items = Array.isArray(body.items) ? body.items.filter((row) => row?.key && row?.xrefName) : [];
    if (!organizationId || !projectId || !folderParam || !externalFileId || items.length === 0) {
      return new Response(null, { status: 400 });
    }
    if (!ALLOWED_FOLDERS.has(folderParam)) return new Response(null, { status: 404 });
    const folder = folderParam as SemanticFolderType;
    if (!capabilityForContractorFolder(folder)) return new Response(null, { status: 404 });
    const context = await requireExternalContext();
    const resolved = await resolveContractorFolderXrefs(context, {
      organizationId,
      projectId,
      folder,
      externalFileId,
      items,
    });
    return Response.json(resolved, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'errors.unexpected');
  }
}