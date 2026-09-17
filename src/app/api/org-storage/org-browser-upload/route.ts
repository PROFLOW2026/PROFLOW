import { uploadOrgStorageFile } from '@/modules/external-storage/server';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { apiRouteErrorFromUnknown, apiRouteErrorResponse } from '@/shared/errors';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) {
      return apiRouteErrorResponse('errors.organizationContextRequired', 403);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const parentFolderExternalId = formData.get('parentFolderExternalId');
    if (!(file instanceof File) || typeof parentFolderExternalId !== 'string' || !parentFolderExternalId) {
      return apiRouteErrorResponse('errors.validationFailed', 400);
    }

    const uploaded = await runInOrgContext(
      session.user.id,
      session.activeOrganizationId,
      async (orgContext) =>
        uploadOrgStorageFile(orgContext, {
          parentFolderExternalId,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          body: file.stream(),
          sizeBytes: file.size,
        }),
    );

    return Response.json({ file: uploaded });
  } catch (error) {
    return apiRouteErrorFromUnknown(error, 'externalStorage.errors.operationFailed');
  }
}
