import { createHash } from 'node:crypto';
import { BOQ_XLSX_DRAFT_BANNER } from '@/modules/electrical-takeoff/domain/boq-warnings';
import { externalAnalysisView, type ExternalReviewSource } from './review-view';
import { externalAnnotatedPdfFromSession, externalBoqPdfRequest, externalWorkerRequest } from './worker-request';
import type { WorkerJobRequest } from '@/modules/electrical-takeoff/domain/contracts';
import { manualChoiceKey, resolveExternalXrefFile, type XrefIdentity } from '../domain/identity';
import { partCount, type ExternalSessionService } from '../domain/session-service';
import { sessionReadable } from '../domain/session-rules';

export interface ToolActor {
  organizationId: string;
  userId: string | null;
  principalId: string | null;
  actorKind: 'member' | 'contractor';
  canTakeoff: boolean;
  demo: boolean;
}

export interface ToolCommand {
  method: 'GET' | 'POST' | 'PUT';
  segments: readonly string[];
  body?: Record<string, unknown> | null;
  bytes?: Uint8Array | null;
  query?: Record<string, string | undefined>;
  actor?: ToolActor;
  token?: string | null;
  workerSupportsExternal?: boolean;
  origin?: string | null;
}

export interface ToolResult {
  status: number;
  body: Record<string, unknown>;
  bytes?: Uint8Array;
  contentType?: string;
  workerJob?: WorkerJobRequest;
  /** Server-only worker export. Never copied into the browser JSON. */
  exportCall?: { path: string; token: string | null; body: Record<string, unknown>; mime: string; fileName: string };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function own(service: ExternalSessionService, sessionId: string, actor: ToolActor): ToolResult | null {
  if (!service.owns(sessionId, actor)) return { status: 404, body: { error: 'not_found' } };
  return null;
}

/** Excel keeps the existing draft banner until the temporary approval, and keeps real warnings after it. */
export function externalExportBanner(reviewedAt: Date | null, warnings: readonly string[]): string[] {
  return reviewedAt ? [...warnings] : [BOQ_XLSX_DRAFT_BANNER, ...warnings];
}

export function dispatchExternalTools(service: ExternalSessionService, command: ToolCommand, now = new Date()): ToolResult {
  const [root, sessionId, action, logicalId, leaf] = command.segments;
  try {
    if (root === 'worker') {
      const workerSessionId = command.segments[2] ?? '';
      if (!service.sessions.has(workerSessionId)) return { status: 404, body: { error: 'not_found' } };
      return dispatchWorker(service, command, workerSessionId, now);
    }
    if (root === 'sessions' && !sessionId && command.method === 'POST') {
      const actor = command.actor;
      if (!actor || actor.demo || !actor.canTakeoff) return { status: 403, body: { error: 'forbidden' } };
      if (actor.actorKind === 'member' && !actor.userId) return { status: 403, body: { error: 'forbidden' } };
      if (actor.actorKind === 'contractor' && !actor.principalId) return { status: 403, body: { error: 'forbidden' } };
      const created = service.create({
        organizationId: actor.organizationId,
        userId: actor.userId,
        actorKind: actor.actorKind,
        principalId: actor.principalId,
        now,
      });
      return { status: 201, body: { sessionId: created.session.id, expiresAt: created.session.expiresAt.toISOString() } };
    }

    if (!sessionId || !service.sessions.has(sessionId)) return { status: 404, body: { error: 'not_found' } };
    const session = service.sessions.get(sessionId)!;

    const actor = command.actor;
    if (!actor) return { status: 403, body: { error: 'forbidden' } };
    const denied = own(service, sessionId, actor);
    if (denied) return denied;
    if (command.method === 'GET' && action === undefined) {
      if (!sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now })) {
        return { status: 410, body: { error: 'gone' } };
      }
      return {
        status: 200,
        body: {
          status: session.status,
          percent: session.percent,
          stage: session.stage,
          message: session.message,
          expiresAt: session.expiresAt.toISOString(),
          reviewedAt: session.reviewedAt?.toISOString() ?? null,
          xrefs: [...session.xrefs.values()],
        },
      };
    }

    if (command.method === 'POST' && action === 'files' && !logicalId) {
      if (session.status !== 'uploading') return { status: 409, body: { error: 'conflict' } };
      const id = text(command.body?.logicalId);
      const relativePath = text(command.body?.relativePath);
      const size = Number(command.body?.size);
      const role = text(command.body?.role) as 'host' | 'xref' | 'pdf' | 'dxf';
      if (!id || !relativePath || !Number.isFinite(size) || size < 0) return { status: 422, body: { error: 'invalid' } };
      const existed = session.files.has(id);
      service.addFile(sessionId, { logicalId: id, relativePath, role, size });
      return { status: existed ? 200 : 201, body: { logicalId: id, partCount: partCount(size) } };
    }

    if (command.method === 'PUT' && action === 'files' && leaf === 'part') {
      const partIndex = Number(command.query?.partIndex ?? '');
      const bytes = command.bytes;
      if (!bytes || !Number.isInteger(partIndex) || partIndex < 0) return { status: 422, body: { error: 'invalid' } };
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const claimed = command.query?.sha256;
      if (claimed && claimed !== sha256) return { status: 422, body: { error: 'checksum' } };
      service.lockPart(sessionId, logicalId ?? '', partIndex, sha256, bytes);
      return { status: 200, body: { logicalId, partIndex, sha256, locked: true } };
    }

    if (command.method === 'POST' && action === 'files' && leaf === 'upload-url') {
      const partIndex = Number(command.body?.partIndex);
      const uploadKey = service.issueUploadUrl(sessionId, logicalId ?? '', partIndex);
      return { status: 200, body: { uploadKey, partIndex } };
    }

    if (command.method === 'GET' && action === 'files' && leaf === 'bytes') {
      const partIndex = Number(command.query?.partIndex ?? '0');
      const part = service.readLockedPart(sessionId, logicalId ?? '', partIndex, now);
      return {
        status: 200,
        body: { ...part, lockedKey: `${sessionId}/${logicalId}/${partIndex}/locked`, providerFileId: logicalId },
      };
    }

    if (command.method === 'POST' && action === 'files' && leaf === 'complete') {
      const sha256 = text(command.body?.sha256);
      service.completeFile(sessionId, logicalId ?? '', sha256);
      return { status: 200, body: { logicalId, sha256 } };
    }

    if (command.method === 'POST' && action === 'xrefs') {
      const choice = {
        parentLogicalId: text(command.body?.parentLogicalId),
        blockName: text(command.body?.blockName),
        savedPath: text(command.body?.savedPath),
        resolvedLogicalId: text(command.body?.logicalId) || null,
      };
      service.chooseXref(sessionId, choice);
      return { status: 200, body: { key: manualChoiceKey(choice) } };
    }

    if (command.method === 'POST' && action === 'analyze') {
      const requestId = text(command.body?.requestId);
      if (!requestId) return { status: 422, body: { error: 'invalid' } };
      if (session.analyzeRequestId === requestId && session.workerJobId && ['queued', 'running', 'ready', 'reviewed'].includes(session.status)) {
        return { status: 200, body: { workerJobId: session.workerJobId, created: false } };
      }
      if (command.workerSupportsExternal === false) return { status: 503, body: { error: 'worker_capability' } };
      const files = [...session.files.values()];
      if (files.length === 0 || files.some((file) => !file.sha256)) return { status: 422, body: { error: 'files_unlocked' } };
      if (session.status !== 'uploading' && session.status !== 'failed') return { status: 409, body: { error: 'conflict' } };
      const job = service.analyze(sessionId, requestId, `job-${requestId}`);
      if (!job.created || !command.origin) return { status: job.created ? 202 : 200, body: job };
      const tokens = service.ensureCallbackTokens(sessionId);
      const workerJob = externalWorkerRequest({
        sessionId,
        jobId: job.workerJobId,
        origin: command.origin,
        files: files.map((file) => ({
          logicalId: file.logicalId,
          name: file.relativePath,
          size: file.size,
          sha256: file.sha256,
        })),
        tokens,
      });
      return { status: 202, body: job, workerJob };
    }

    if (command.method === 'POST' && action === 'edits') {
      const rawSeq = Number(command.body?.seq);
      const seq = Number.isInteger(rawSeq) && rawSeq > 0 && rawSeq <= 2147483647 ? rawSeq : session.revision;
      const expected = Number(command.body?.expectedRevision);
      if (expected !== session.revision) return { status: 409, body: { error: 'revision' } };
      const before = session.reviewedAt;
      service.edit(sessionId, seq, command.body?.op ?? null);
      return {
        status: 200,
        body: { revision: session.revision, reviewedAt: session.reviewedAt, clearedApproval: before !== null && session.reviewedAt === null },
      };
    }

    if (command.method === 'GET' && action === 'review') {
      const payload = session.resultPayload;
      if (!payload || typeof payload !== 'object') return { status: 409, body: { error: 'result_missing' } };
      const record = payload as {
        sheets?: unknown;
        detections?: unknown;
        legend?: unknown;
        warnings?: unknown;
      };
      const view = externalAnalysisView({
        sessionId,
        revision: session.revision,
        reviewedAt: session.reviewedAt,
        updatedAt: session.resultStoredAt ?? now,
        files: [...session.files.values()].map((file) => ({
          id: file.logicalId,
          name: file.relativePath,
          kind: file.relativePath.toLowerCase().endsWith('.pdf') || file.role === 'pdf'
            ? 'pdf'
            : file.relativePath.toLowerCase().endsWith('.dxf') || file.role === 'dxf'
              ? 'dxf'
              : 'dwg',
          size: file.size,
          sha256: file.sha256,
        })),
        sheets: (Array.isArray(record.sheets) ? record.sheets : []) as ExternalReviewSource['sheets'],
        detections: (Array.isArray(record.detections) ? record.detections : []) as ExternalReviewSource['detections'],
        legend: (Array.isArray(record.legend) ? record.legend : []) as ExternalReviewSource['legend'],
        warnings: (Array.isArray(record.warnings) ? record.warnings : []) as ExternalReviewSource['warnings'],
        edits: session.edits.flatMap((edit) => (edit.op && typeof edit.op === 'object' ? [edit.op as never] : [])),
        canEdit: sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now }),
      });
      return { status: 200, body: view as unknown as Record<string, unknown> };
    }

    if (command.method === 'POST' && action === 'review') {
      if (session.reviewedAt) return { status: 200, body: { reviewedAt: session.reviewedAt.toISOString() } };
      if (session.status !== 'ready') return { status: 409, body: { error: 'conflict' } };
      service.review(sessionId, now);
      return { status: 200, body: { reviewedAt: now.toISOString() } };
    }

    if (command.method === 'GET' && action === 'export') {
      if (!sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now })) {
        return { status: 410, body: { error: 'gone' } };
      }
      const format = command.query?.format ?? '';
      const warnings = Array.isArray(command.body?.warnings) ? command.body.warnings.filter((item) => typeof item === 'string') : [];
      if (format !== 'xlsx' && format !== 'boq-pdf' && format !== 'annotated-pdf') {
        return { status: 200, body: { banner: externalExportBanner(session.reviewedAt, warnings) } };
      }
      const payload = session.resultPayload;
      if (!payload || typeof payload !== 'object') return { status: 409, body: { error: 'result_missing' } };
      const record = payload as { sheets?: unknown; detections?: unknown; legend?: unknown; warnings?: unknown };
      const workerWarnings = (Array.isArray(record.warnings) ? record.warnings : []) as ExternalReviewSource['warnings'];
      const view = externalAnalysisView({
        sessionId,
        revision: session.revision,
        reviewedAt: session.reviewedAt,
        updatedAt: session.resultStoredAt ?? now,
        files: [...session.files.values()].map((file) => ({
          id: file.logicalId,
          name: file.relativePath,
          kind: file.relativePath.toLowerCase().endsWith('.pdf')
            ? 'pdf'
            : file.relativePath.toLowerCase().endsWith('.dxf')
              ? 'dxf'
              : 'dwg',
          size: file.size,
          sha256: file.sha256,
        })),
        sheets: (Array.isArray(record.sheets) ? record.sheets : []) as ExternalReviewSource['sheets'],
        detections: (Array.isArray(record.detections) ? record.detections : []) as ExternalReviewSource['detections'],
        legend: (Array.isArray(record.legend) ? record.legend : []) as ExternalReviewSource['legend'],
        warnings: workerWarnings,
        edits: session.edits.flatMap((edit) => (edit.op && typeof edit.op === 'object' ? [edit.op as never] : [])),
        canEdit: false,
      });
      const boq = {
        ...view.boq,
        warnings: [...new Set([...view.boq.warnings, ...workerWarnings.map((warning) => warning.message)])],
      };
      if (command.query?.status === '1') {
        if (format === 'annotated-pdf' && !externalAnnotatedPdfFromSession({ session, origin: command.origin ?? '', token: 'pending' })) {
          return { status: 409, body: { error: 'pdf_required' } };
        }
        return { status: 204, body: {} };
      }
      if (format === 'xlsx') {
        return { status: 200, body: { fileName: 'external-boq.xlsx', boq, reviewedAt: session.reviewedAt?.toISOString() ?? null } };
      }
      const tokens = service.ensureCallbackTokens(sessionId);
      if (format === 'annotated-pdf') {
        const body = externalAnnotatedPdfFromSession({ session, origin: command.origin ?? '', token: tokens.result });
        if (!body) return { status: 409, body: { error: 'pdf_required' } };
        return {
          status: 200,
          body: { fileName: 'external-annotated.pdf' },
          exportCall: {
            path: '/v1/export/annotated-pdf',
            token: tokens.result,
            body,
            mime: 'application/pdf',
            fileName: 'external-annotated.pdf',
          },
        };
      }
      return {
        status: 200,
        body: { fileName: 'external-boq.pdf' },
        exportCall: {
          path: '/v1/export/boq-pdf',
          token: null,
          body: externalBoqPdfRequest({ title: view.summary.name, approved: view.summary.status === 'approved', boq }),
          mime: 'application/pdf',
          fileName: 'external-boq.pdf',
        },
      };
    }

    if (command.method === 'POST' && action === 'cancel') {
      const rotated = service.rotateCancelTokens(sessionId);
      return { status: 200, body: { cancelled: true, rotated: rotated !== null } };
    }

    if (command.method === 'POST' && action === 'close') {
      service.close(sessionId, now);
      const purge = service.readyToPurge(sessionId, now);
      return { status: 200, body: { closed: true, purge } };
    }

    return { status: 404, body: { error: 'not_found' } };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid';
    if (code === 'conflict') return { status: 409, body: { error: code } };
    if (code === 'gone') return { status: 410, body: { error: code } };
    if (code === 'terminal_token' || code === 'progress_token') return { status: 401, body: { error: code } };
    return { status: 422, body: { error: code } };
  }
}

function dispatchWorker(service: ExternalSessionService, command: ToolCommand, sessionId: string, now: Date): ToolResult {
  const session = service.sessions.get(sessionId)!;
  const token = command.token ?? '';
  const hashed = createHash('sha256').update(token).digest('hex');
  const action = command.segments[1];
  if (action === 'progress') {
    if (hashed !== session.progressTokenHash) return { status: 401, body: { error: 'progress_token' } };
    service.progress(sessionId, token, text(command.body?.stage), Number(command.body?.percent) || 0, text(command.body?.message) || null, now);
    return { status: 200, body: { leaseUntil: session.workerLeaseUntil?.toISOString() ?? null } };
  }
  if (action === 'result') {
    if (hashed !== session.resultTokenHash && hashed !== session.sourceTokenHash) {
      return { status: 401, body: { error: 'result_token' } };
    }
    const sha256 = text(command.body?.sha256) || createHash('sha256').update(JSON.stringify(command.body ?? {})).digest('hex');
    const stored = service.storeVerifiedResult(sessionId, sha256, now, command.body ?? null);
    return { status: 200, body: stored };
  }
  if (action === 'terminal') {
    const outcome = command.body?.outcome === 'failed' ? 'failed' : 'ready';
    const stored = service.terminal(sessionId, token, outcome, now);
    return { status: 200, body: { ...stored, status: session.status } };
  }
  if (action === 'file' || action === 'xref') {
    const exportRead = session.status === 'ready' || session.status === 'reviewed';
    const allowed = exportRead
      ? hashed === session.resultTokenHash || hashed === session.sourceTokenHash
      : hashed === session.sourceTokenHash;
    if (!allowed) return { status: 401, body: { error: 'source_token' } };
    const identity =
      action === 'xref'
        ? resolveExternalXrefFile(
            [...session.files.values()],
            [...session.xrefs.values()],
            {
              parentLogicalId: text(command.query?.fileId),
              blockName: text(command.query?.block),
              savedPath: text(command.query?.path),
            },
          )
        : command.segments[3] || text(command.query?.logicalId);
    if (!identity) return { status: 404, body: { error: 'xref_missing' } };
    const bytes = service.readLockedFile(sessionId, identity, now, exportRead ? 'export' : 'worker');
    return {
      status: 200,
      body: { logicalId: identity, providerFileId: identity },
      bytes,
      contentType: 'application/octet-stream',
    };
  }
  return { status: 404, body: { error: 'not_found' } };
}

export function choiceIdentity(choice: XrefIdentity): string {
  return manualChoiceKey(choice);
}
