import 'server-only';

import { requireExternalContext } from '@/modules/contractor-access';
import { completeExternalEvidenceUpload, completeInternalEvidenceUpload, EVIDENCE_SIZE_LIMITS } from '@/modules/evidence';
import { fileRouteError, readRequestBytes } from '@/modules/evidence/http';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { DomainRuleError } from '@/shared/errors';
import { uploadVideoChunk } from './application/videos';
import { INFRA_VIDEO_SINGLE_MAX_BYTES, VIDEO_ENTITY_UPLOAD_HEADERS } from './domain/video';
import { infraDeps } from './server';
import { infraVideoPort } from './video-server';

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

/** Reads the chunk position headers and the (bounded) body shared by both video routes. */
async function readVideoChunkRequest(request: Request, evidenceId: string) {
  const numberHeader = (name: string) => {
    const raw = request.headers.get(name);
    return raw !== null && /^\d{1,12}$/.test(raw) ? Number(raw) : Number.NaN;
  };
  const offset = numberHeader(VIDEO_ENTITY_UPLOAD_HEADERS.offset);
  const totalBytes = numberHeader(VIDEO_ENTITY_UPLOAD_HEADERS.total);
  if (!Number.isFinite(offset) || !Number.isFinite(totalBytes)) {
    throw new DomainRuleError('Missing upload headers', 'infraMapping.errors.videoChunk');
  }
  const sealed = request.headers.get(VIDEO_ENTITY_UPLOAD_HEADERS.session);
  const bytes = await readRequestBytes(request, INFRA_VIDEO_SINGLE_MAX_BYTES);
  return { evidenceId, offset, totalBytes, session: sealed || null, bytes };
}

/**
 * One chunk of a short video from the owner or employee app. The browser sends a few MB at a time;
 * this relays the chunk to the organization's cloud and answers `{ done, nextOffset, session }`.
 * Never a whole video in one request, never a provider token or URL in the response.
 */
export async function handleInternalVideoChunk(request: Request, evidenceId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    const chunk = await readVideoChunkRequest(request, evidenceId);
    const result = await runInOrgContext(session.user.id, session.activeOrganizationId, (context) =>
      uploadVideoChunk({ kind: 'internal', context }, chunk, infraVideoPort, infraDeps),
    );
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return fileRouteError(error);
  }
}

/** The same chunk relay for a contractor: only its own pending video, only while its grant allows documenting. */
export async function handleExternalVideoChunk(request: Request, evidenceId: string): Promise<Response> {
  try {
    const context = await requireExternalContext();
    const chunk = await readVideoChunkRequest(request, evidenceId);
    const result = await uploadVideoChunk({ kind: 'external', context }, chunk, infraVideoPort, infraDeps);
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
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
