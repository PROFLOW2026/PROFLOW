import 'server-only';

import { requireExternalContext } from '@/modules/contractor-access';
import { completeExternalEvidenceUpload, completeInternalEvidenceUpload, EVIDENCE_SIZE_LIMITS } from '@/modules/evidence';
import { fileRouteError, readRequestBytes } from '@/modules/evidence/http';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { infraDeps } from './server';

/**
 * Byte-upload endpoints for infrastructure photos. Step 2 of the two-step flow: the capture and the
 * pending evidence row were registered (after the user approved the photo); here the bytes go to
 * the location's folder in the organization's own cloud storage. Contractors upload through the
 * second route and never need a personal cloud connection.
 */

export async function handleInternalInfraUpload(request: Request, evidenceId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    const contentType = request.headers.get('content-type');
    const bytes = await readRequestBytes(request, EVIDENCE_SIZE_LIMITS.photo);
    await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      completeInternalEvidenceUpload(context, { evidenceId, contentType, bytes }, infraDeps.files),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalInfraUpload(request: Request, evidenceId: string): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const contentType = request.headers.get('content-type');
    const bytes = await readRequestBytes(request, EVIDENCE_SIZE_LIMITS.photo);
    await completeExternalEvidenceUpload(context, { evidenceId, contentType, bytes }, infraDeps.files);
    return new Response(null, { status: 204 });
  } catch (error) {
    return fileRouteError(error);
  }
}
