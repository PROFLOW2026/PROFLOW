import 'server-only';

import { requireExternalContext } from '@/modules/contractor-access';
import { fileRouteError, readRequestBytes } from '@/modules/evidence/http';
import { requireSession, runInOrgContext } from '@/shared/auth/session';
import { getAdminDb } from '@/shared/db';
import { TAKEOFF_CHUNK_BYTES, findArtifact, findFile } from './data/takeoff.repository';
import { handleTakeoffChunk, TAKEOFF_UPLOAD_HEADERS } from './application/chunk-upload';
import { resolveTakeoffFileStoreForAnalysis } from './application/takeoff-persistence';
import { applyWorkerArtifact, applyWorkerProgress, applyWorkerResult, authorizeWorkerJob } from './application/worker-callbacks';
import { isWorkerIngestError } from './domain/worker-ingest-error';
import { buildExportBytes, takeoffExportDownloadHeaders } from './application/export-download';
import type { ExportKind } from './domain/contracts';
import { assertAnalysisAccess, externalActorFrom, internalActorFrom, takeoffOrgScope } from './application/access';
import { openArchitecturalBackground, openWorkerXref } from './application/takeoff-architectural-background';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

let takeoffRouteAdminDbOverride: DbExecutor | null = null;

/** Vitest-only: wire worker callback routes to the PGlite executor. */
export function setTakeoffRouteAdminDbForTests(db: DbExecutor | null): void {
  takeoffRouteAdminDbOverride = db;
}

function takeoffAdminDb(): DbExecutor {
  return takeoffRouteAdminDbOverride ?? getAdminDb();
}

export async function handleInternalTakeoffUpload(request: Request, fileId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    const offset = Number(request.headers.get(TAKEOFF_UPLOAD_HEADERS.offset));
    const total = Number(request.headers.get(TAKEOFF_UPLOAD_HEADERS.total));
    const sessionRaw = request.headers.get(TAKEOFF_UPLOAD_HEADERS.session);
    const bytes = await readRequestBytes(request, TAKEOFF_CHUNK_BYTES);
    const result = await runInOrgContext(session.user.id, session.activeOrganizationId, async (context) => {
      const file = await findFile(context.db, context.organizationId, fileId);
      if (!file) throw new Error('not_found');
      const store = await resolveTakeoffFileStoreForAnalysis(context.db, context.organizationId, file.analysisId);
      return handleTakeoffChunk({
        db: context.db,
        store,
        organizationId: context.organizationId,
        projectId: file.projectId,
        fileId,
        kind: file.kind as 'pdf' | 'dwg' | 'dxf',
        offset,
        totalBytes: total,
        sessionRaw,
        bytes: new Uint8Array(bytes),
      });
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalTakeoffUpload(request: Request, fileId: string): Promise<Response> {
  try {
    const external = await requireExternalContext();
    const offset = Number(request.headers.get(TAKEOFF_UPLOAD_HEADERS.offset));
    const total = Number(request.headers.get(TAKEOFF_UPLOAD_HEADERS.total));
    const sessionRaw = request.headers.get(TAKEOFF_UPLOAD_HEADERS.session);
    const bytes = await readRequestBytes(request, TAKEOFF_CHUNK_BYTES);
    const orgId = external.grants[0]?.organizationId;
    if (!orgId) return new Response(null, { status: 403 });
    const file = await findFile(external.db, orgId, fileId);
    if (!file) return new Response(null, { status: 404 });
    const store = await resolveTakeoffFileStoreForAnalysis(external.db, orgId, file.analysisId);
    const result = await handleTakeoffChunk({
      db: external.db,
      store,
      organizationId: orgId,
      projectId: file.projectId,
      fileId,
      kind: file.kind as 'pdf' | 'dwg' | 'dxf',
      offset,
      totalBytes: total,
      sessionRaw,
      bytes: new Uint8Array(bytes),
    });
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return fileRouteError(error);
  }
}

function bearer(request: Request): string {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
}

export async function handleWorkerResult(request: Request, jobId: string): Promise<Response> {
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const db = takeoffAdminDb();
  const job = await authorizeWorkerJob(db, jobId, bearer(request), secret);
  if (!job) return new Response(null, { status: 401 });
  try {
    await applyWorkerResult(db, jobId, await request.json());
    return new Response(null, { status: 204 });
  } catch (error) {
    if (isWorkerIngestError(error)) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

export async function handleWorkerProgress(request: Request, jobId: string): Promise<Response> {
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const db = takeoffAdminDb();
  if (!(await authorizeWorkerJob(db, jobId, bearer(request), secret))) return new Response(null, { status: 401 });
  await applyWorkerProgress(db, jobId, await request.json());
  return new Response(null, { status: 204 });
}

export async function handleWorkerXref(request: Request, jobId: string): Promise<Response> {
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const db = takeoffAdminDb();
  const job = await authorizeWorkerJob(db, jobId, bearer(request), secret);
  if (!job) return new Response(null, { status: 401 });
  const url = new URL(request.url);
  const fileId = url.searchParams.get('fileId') ?? '';
  const xrefPath = url.searchParams.get('path') ?? '';
  const anchor = url.searchParams.get('anchor') ?? '';
  const file = await findFile(db, job.organizationId, fileId);
  if (!file || file.analysisId !== job.analysisId) return new Response(null, { status: 404 });
  const opened = await openWorkerXref({
    db,
    organizationId: job.organizationId,
    fileId,
    xrefPath,
    anchorPath: anchor,
  });
  if (!opened) return new Response(null, { status: 404 });
  return new Response(opened.stream, {
    headers: {
      'Content-Type': opened.mimeType,
      ...(opened.sizeBytes !== null ? { 'Content-Length': String(opened.sizeBytes) } : {}),
      'X-Provider-File-Id': opened.providerFileId,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function handleWorkerArtifact(request: Request, jobId: string): Promise<Response> {
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const db = takeoffAdminDb();
  if (!(await authorizeWorkerJob(db, jobId, bearer(request), secret))) return new Response(null, { status: 401 });
  const form = await request.formData();
  const name = String(form.get('name') ?? 'artifact.bin');
  const mimeType = String(form.get('mimeType') ?? 'application/octet-stream');
  const file = form.get('file');
  const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : new Uint8Array();
  const id = await applyWorkerArtifact(db, jobId, name, bytes, mimeType);
  return Response.json({ artifactId: id });
}

export async function handleWorkerFile(request: Request, jobId: string, fileId: string): Promise<Response> {
  const secret = process.env.TAKEOFF_WORKER_SECRET;
  if (!secret) return new Response(null, { status: 503 });
  const db = takeoffAdminDb();
  const job = await authorizeWorkerJob(db, jobId, bearer(request), secret);
  if (!job) return new Response(null, { status: 401 });
  const store = await resolveTakeoffFileStoreForAnalysis(db, job.organizationId, job.analysisId);
  const stream = await store.openReadStream({
    organizationId: job.organizationId,
    fileId,
    rangeHeader: request.headers.get('range'),
  });
  return new Response(stream.body, {
    headers: {
      'Content-Type': stream.contentType,
      ...(stream.contentLength !== null ? { 'Content-Length': String(stream.contentLength) } : {}),
      'Cache-Control': 'private, no-store',
    },
  });
}

async function streamArtifact(context: OrgContext, artifactId: string): Promise<Response> {
  const artifact = await findArtifact(context.db, context.organizationId, artifactId);
  if (!artifact) return new Response(null, { status: 404 });
  await assertAnalysisAccess(internalActorFrom(context), artifact.analysisId, 'view');
  const { streamTakeoffArtifact } = await import('./application/takeoff-artifact-store');
  const stream = await streamTakeoffArtifact(
    context.db,
    context.organizationId,
    artifact.jobId,
    artifact.name,
    artifact.mimeType,
  );
  return new Response(stream.body, {
    headers: {
      'Content-Type': stream.contentType,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export async function handleArtifactDownload(request: Request, artifactId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    return await runInOrgContext(session.user.id, session.activeOrganizationId, (ctx) => streamArtifact(ctx, artifactId));
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalArtifactDownload(request: Request, artifactId: string): Promise<Response> {
  try {
    const external = await requireExternalContext();
    const orgId = external.grants[0]?.organizationId;
    if (!orgId) return new Response(null, { status: 403 });
    const artifact = await findArtifact(external.db, orgId, artifactId);
    if (!artifact) return new Response(null, { status: 404 });
    await assertAnalysisAccess(externalActorFrom(external), artifact.analysisId, 'view');
    const { streamTakeoffArtifact } = await import('./application/takeoff-artifact-store');
    const stream = await streamTakeoffArtifact(external.db, orgId, artifact.jobId, artifact.name, artifact.mimeType);
    return new Response(stream.body, {
      headers: { 'Content-Type': artifact.mimeType ?? stream.contentType, 'Cache-Control': 'private, max-age=300' },
    });
  } catch (error) {
    return fileRouteError(error);
  }
}

async function streamSourceFile(actor: Parameters<typeof assertAnalysisAccess>[0], fileId: string, rangeHeader: string | null): Promise<Response> {
  const { db, organizationId } = takeoffOrgScope(actor);
  const file = await findFile(db, organizationId, fileId);
  if (!file || file.uploadState !== 'complete') return new Response(null, { status: 404 });
  await assertAnalysisAccess(actor, file.analysisId, 'view');
  const store = await resolveTakeoffFileStoreForAnalysis(db, organizationId, file.analysisId);
  const stream = await store.openReadStream({ organizationId, fileId, rangeHeader });
  return new Response(stream.body, {
    headers: {
      'Content-Type': stream.contentType || 'application/octet-stream',
      ...(stream.contentLength !== null ? { 'Content-Length': String(stream.contentLength) } : {}),
      'Cache-Control': 'private, no-store',
    },
  });
}

async function streamArchitecturalBackground(
  actor: Parameters<typeof assertAnalysisAccess>[0],
  fileId: string,
  requestedName: string,
): Promise<Response> {
  const { db, organizationId } = takeoffOrgScope(actor);
  const file = await findFile(db, organizationId, fileId);
  if (!file) return new Response(null, { status: 404 });
  await assertAnalysisAccess(actor, file.analysisId, 'view');
  const opened = await openArchitecturalBackground({ db, organizationId, fileId, requestedName });
  if (!opened) return new Response(null, { status: 404 });
  return new Response(opened.stream, {
    headers: {
      'Content-Type': opened.mimeType,
      ...(opened.sizeBytes !== null ? { 'Content-Length': String(opened.sizeBytes) } : {}),
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function handleInternalBackgroundDownload(request: Request, fileId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    const name = new URL(request.url).searchParams.get('name') ?? '';
    return await runInOrgContext(session.user.id, session.activeOrganizationId, (ctx) =>
      streamArchitecturalBackground(internalActorFrom(ctx), fileId, name),
    );
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalBackgroundDownload(request: Request, fileId: string): Promise<Response> {
  try {
    const external = await requireExternalContext();
    if (!external.grants[0]?.organizationId) return new Response(null, { status: 403 });
    const name = new URL(request.url).searchParams.get('name') ?? '';
    return await streamArchitecturalBackground(externalActorFrom(external), fileId, name);
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleInternalSourceDownload(request: Request, fileId: string): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    return await runInOrgContext(session.user.id, session.activeOrganizationId, (ctx) =>
      streamSourceFile(internalActorFrom(ctx), fileId, request.headers.get('range')),
    );
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalSourceDownload(request: Request, fileId: string): Promise<Response> {
  try {
    const external = await requireExternalContext();
    if (!external.grants[0]?.organizationId) return new Response(null, { status: 403 });
    return await streamSourceFile(externalActorFrom(external), fileId, request.headers.get('range'));
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExportDownload(request: Request, analysisId: string, kind: ExportKind): Promise<Response> {
  try {
    const session = await requireSession();
    if (!session.activeOrganizationId) return new Response(null, { status: 403 });
    const statusOnly = request.method === 'HEAD' || new URL(request.url).searchParams.get('status') === '1';
    if (statusOnly) {
      await runInOrgContext(session.user.id, session.activeOrganizationId, async (ctx) => {
        await assertAnalysisAccess(internalActorFrom(ctx), analysisId, 'view');
      });
      return new Response(null, {
        status: 204,
        headers: { 'X-Takeoff-Export-Status': 'ready', 'Cache-Control': 'private, no-store' },
      });
    }
    const payload = await runInOrgContext(session.user.id, session.activeOrganizationId, (ctx) =>
      buildExportBytes(internalActorFrom(ctx), analysisId, kind),
    );
    return new Response(Buffer.from(payload.bytes), {
      headers: takeoffExportDownloadHeaders(payload.fileName, payload.mimeType),
    });
  } catch (error) {
    return fileRouteError(error);
  }
}

export async function handleExternalExportDownload(request: Request, analysisId: string, kind: ExportKind): Promise<Response> {
  try {
    const external = await requireExternalContext();
    if (!external.grants[0]?.organizationId) return new Response(null, { status: 403 });
    const actor = externalActorFrom(external);
    const statusOnly = request.method === 'HEAD' || new URL(request.url).searchParams.get('status') === '1';
    if (statusOnly) {
      await assertAnalysisAccess(actor, analysisId, 'view');
      return new Response(null, {
        status: 204,
        headers: { 'X-Takeoff-Export-Status': 'ready', 'Cache-Control': 'private, no-store' },
      });
    }
    const payload = await buildExportBytes(actor, analysisId, kind);
    return new Response(Buffer.from(payload.bytes), {
      headers: takeoffExportDownloadHeaders(payload.fileName, payload.mimeType),
    });
  } catch (error) {
    return fileRouteError(error);
  }
}