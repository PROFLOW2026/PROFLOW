import 'server-only';

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import {
  externalToolEdits,
  externalToolFiles,
  externalToolObjects,
  externalToolParts,
  externalToolSessions,
  externalToolStreams,
  externalToolXrefs,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { getAdminDb } from '@/shared/db/client';
import { dispatchExternalTools, type ToolCommand, type ToolResult } from '../application/dispatch';
import { ExternalSessionService, type ToolSession } from '../domain/session-service';
import { objectsReadyToDelete, type SessionStatus } from '../domain/session-rules';

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function loadExternalSession(db: DbExecutor, sessionId: string): Promise<ToolSession | null> {
  const [row] = await db.select().from(externalToolSessions).where(eq(externalToolSessions.id, sessionId)).limit(1);
  if (!row) return null;
  const files = await db.select().from(externalToolFiles).where(eq(externalToolFiles.sessionId, sessionId));
  const parts = await db.select().from(externalToolParts).where(eq(externalToolParts.sessionId, sessionId));
  const xrefs = await db.select().from(externalToolXrefs).where(eq(externalToolXrefs.sessionId, sessionId));
  const edits = await db.select().from(externalToolEdits).where(eq(externalToolEdits.sessionId, sessionId));
  const session: ToolSession = {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.createdByUserId,
    actorKind: row.actorKind === 'contractor' ? 'contractor' : 'member',
    principalId: row.principalId,
    status: row.status as ToolSession['status'],
    stage: row.stage,
    percent: row.percent,
    message: row.message,
    workerLeaseUntil: row.workerLeaseUntil,
    lastHeartbeatAt: row.lastHeartbeatAt,
    workerInstanceId: row.workerInstanceId,
    revision: row.revision,
    persistedRevision: row.revision,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    uploadWindowEndsAt: row.uploadWindowEndsAt,
    closedAt: row.closedAt,
    reviewedAt: row.reviewedAt,
    analysisFinishedAt: row.analysisFinishedAt,
    workerJobId: row.workerJobId,
    analyzeRequestId: row.analyzeRequestId,
    sourceTokenHash: row.sourceTokenHash ?? '',
    resultTokenHash: row.resultTokenHash ?? '',
    progressTokenHash: row.progressTokenHash ?? '',
    terminalTokenHash: row.terminalTokenHash ?? '',
    files: new Map(),
    xrefs: new Map(),
    edits: edits.map((edit) => ({ seq: edit.seq, op: edit.op, revisionAfter: edit.revisionAfter })),
    streamLeaseUntil: null,
    purgeError: row.purgeError,
    resultStoredAt: row.resultStoredAt,
    terminalReceivedAt: row.terminalReceivedAt,
    sourceToken: '',
    resultToken: '',
    progressToken: '',
    terminalToken: '',
    cancelledTokenRotation: row.status === 'cancelled',
    resultSha256: row.resultSha256,
    resultPayload: null,
  };
  for (const file of files) {
    session.files.set(file.logicalId, {
      logicalId: file.logicalId,
      relativePath: file.relativePath,
      role: file.role as 'host' | 'xref' | 'pdf' | 'dxf',
      size: num(file.sizeBytes),
      sha256: file.sha256,
      partSize: file.partSizeBytes,
      parts: new Map(),
    });
  }
  for (const part of parts) {
    const file = session.files.get(part.logicalId);
    if (!file || !part.sha256) continue;
    file.parts.set(part.partIndex, {
      sha256: part.sha256,
      locked: part.state === 'locked',
      offset: num(part.offsetBytes),
      size: num(part.sizeBytes),
      bytes: part.state === 'locked' ? await readPartBytes(sessionId, part.logicalId, part.partIndex) : null,
    });
  }
  for (const xref of xrefs) {
    const key = `${xref.parentLogicalId}\u0000${xref.blockName}\u0000${xref.savedPath}`;
    session.xrefs.set(key, {
      parentLogicalId: xref.parentLogicalId,
      blockName: xref.blockName,
      savedPath: xref.savedPath,
      resolvedLogicalId: xref.resolvedLogicalId,
    });
  }
  session.resultPayload = await readResultPayload(sessionId);
  return session;
}

function objectRoot(): string | null {
  const root = process.env.EXLFY_EXTERNAL_OBJECT_ROOT;
  if (!root || !root.includes('exlfy-external-tools-objects')) return null;
  return root;
}

async function readPartBytes(sessionId: string, logicalId: string, partIndex: number): Promise<Uint8Array | null> {
  const root = objectRoot();
  if (!root) return null;
  try {
    return new Uint8Array(await readFile(path.join(root, sessionId, logicalId, `${partIndex}.bin`)));
  } catch {
    return null;
  }
}

async function readResultPayload(sessionId: string): Promise<unknown> {
  const root = objectRoot();
  if (!root) return null;
  try {
    const raw = await readFile(path.join(root, sessionId, 'result.json'), 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

async function writeSessionObjects(session: ToolSession): Promise<void> {
  const root = objectRoot();
  if (!root) return;
  const dir = path.join(root, session.id);
  await mkdir(dir, { recursive: true });
  if (session.resultPayload && typeof session.resultPayload === 'object') {
    await writeFile(path.join(dir, 'result.json'), JSON.stringify(session.resultPayload));
  }
  for (const file of session.files.values()) {
    for (const [index, part] of file.parts) {
      if (!part.locked || !part.bytes) continue;
      const partDir = path.join(dir, file.logicalId);
      await mkdir(partDir, { recursive: true });
      await writeFile(path.join(partDir, `${index}.bin`), part.bytes);
    }
  }
}

export async function saveExternalSession(db: DbExecutor, session: ToolSession): Promise<boolean> {
  const written = await db
    .insert(externalToolSessions)
    .values({
      id: session.id,
      organizationId: session.organizationId,
      createdByUserId: session.userId,
      actorKind: session.actorKind,
      principalId: session.principalId,
      status: session.status,
      expiresAt: session.expiresAt,
      uploadWindowEndsAt: session.uploadWindowEndsAt,
      workerLeaseUntil: session.workerLeaseUntil,
      lastHeartbeatAt: session.lastHeartbeatAt,
      workerInstanceId: session.workerInstanceId,
      sourceTokenHash: session.sourceTokenHash,
      resultTokenHash: session.resultTokenHash,
      progressTokenHash: session.progressTokenHash,
      terminalTokenHash: session.terminalTokenHash,
      revision: session.revision,
      stage: session.stage,
      percent: session.percent,
      message: session.message,
      reviewedAt: session.reviewedAt,
      analysisFinishedAt: session.analysisFinishedAt,
      closedAt: session.closedAt,
      resultSha256: session.resultSha256,
      resultStoredAt: session.resultStoredAt,
      terminalReceivedAt: session.terminalReceivedAt,
      workerJobId: session.workerJobId,
      analyzeRequestId: session.analyzeRequestId,
      purgeError: session.purgeError,
    })
    .onConflictDoUpdate({
      target: externalToolSessions.id,
      set: {
        status: session.status,
        revision: session.revision,
        stage: session.stage,
        percent: session.percent,
        message: session.message,
        reviewedAt: session.reviewedAt,
        workerLeaseUntil: session.workerLeaseUntil,
        lastHeartbeatAt: session.lastHeartbeatAt,
        sourceTokenHash: session.sourceTokenHash,
        resultTokenHash: session.resultTokenHash,
        progressTokenHash: session.progressTokenHash,
        terminalTokenHash: session.terminalTokenHash,
        resultSha256: session.resultSha256,
        resultStoredAt: session.resultStoredAt,
        terminalReceivedAt: session.terminalReceivedAt,
        closedAt: session.closedAt,
        workerJobId: session.workerJobId,
        analyzeRequestId: session.analyzeRequestId,
        purgeError: session.purgeError,
        analysisFinishedAt: session.analysisFinishedAt,
      },
      where: eq(externalToolSessions.revision, session.persistedRevision),
    })
    .returning({ id: externalToolSessions.id });
  if (written.length === 0) return false;
  session.persistedRevision = session.revision;

  for (const file of session.files.values()) {
    await db
      .insert(externalToolFiles)
      .values({
        sessionId: session.id,
        logicalId: file.logicalId,
        relativePath: file.relativePath,
        idempotencyKey: file.logicalId,
        role: file.role,
        sizeBytes: file.size,
        sha256: file.sha256,
        uploadState: file.sha256 ? 'complete' : 'uploading',
        partSizeBytes: file.partSize,
        partCount: Math.max(1, Math.ceil(file.size / file.partSize)),
      })
      .onConflictDoUpdate({
        target: [externalToolFiles.sessionId, externalToolFiles.logicalId],
        set: { sha256: file.sha256, uploadState: file.sha256 ? 'complete' : 'uploading' },
      });
    for (const [index, part] of file.parts) {
      await db
        .insert(externalToolParts)
        .values({
          sessionId: session.id,
          logicalId: file.logicalId,
          partIndex: index,
          offsetBytes: part.offset,
          sizeBytes: part.size,
          uploadKey: `${session.id}/${file.logicalId}/${index}/upload`,
          lockedKey: part.locked ? `${session.id}/${file.logicalId}/${index}/locked` : null,
          sha256: part.sha256,
          state: part.locked ? 'locked' : 'issued',
        })
        .onConflictDoUpdate({
          target: [externalToolParts.sessionId, externalToolParts.logicalId, externalToolParts.partIndex],
          set: {
            sha256: part.sha256,
            state: part.locked ? 'locked' : 'issued',
            lockedKey: part.locked ? `${session.id}/${file.logicalId}/${index}/locked` : null,
          },
        });
    }
  }

  for (const edit of session.edits) {
    await db
      .insert(externalToolEdits)
      .values({
        sessionId: session.id,
        seq: edit.seq,
        op: edit.op,
        revisionAfter: edit.revisionAfter,
      })
      .onConflictDoNothing();
  }

  await writeSessionObjects(session);
  if (session.streamLeaseUntil) {
    await db.delete(externalToolStreams).where(and(eq(externalToolStreams.sessionId, session.id), eq(externalToolStreams.streamId, 'read')));
    await db.insert(externalToolStreams).values({
      sessionId: session.id,
      streamId: 'read',
      leaseUntil: session.streamLeaseUntil,
      partIndex: 0,
    });
  }

  for (const xref of session.xrefs.values()) {
    await db
      .insert(externalToolXrefs)
      .values({
        sessionId: session.id,
        hostLogicalId: xref.parentLogicalId,
        parentLogicalId: xref.parentLogicalId,
        blockName: xref.blockName,
        savedPath: xref.savedPath,
        resolvedLogicalId: xref.resolvedLogicalId,
        displayState: xref.resolvedLogicalId ? 'found' : 'choice',
      })
      .onConflictDoUpdate({
        target: [
          externalToolXrefs.sessionId,
          externalToolXrefs.parentLogicalId,
          externalToolXrefs.blockName,
          externalToolXrefs.savedPath,
        ],
        set: { resolvedLogicalId: xref.resolvedLogicalId, displayState: xref.resolvedLogicalId ? 'found' : 'choice' },
      });
  }
  return true;
}

export async function runPersistedExternalCommand(command: ToolCommand): Promise<ToolResult> {
  const db = getAdminDb();
  const sessionId = command.segments[0] === 'worker' ? command.segments[2] : command.segments[1];
  let last: ToolResult = { status: 409, body: { error: 'conflict' } };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const service = new ExternalSessionService();
    if (sessionId) {
      const loaded = await loadExternalSession(db, sessionId);
      if (loaded) service.sessions.set(loaded.id, loaded);
    }
    last = dispatchExternalTools(service, command);
    let conflict = false;
    for (const session of service.sessions.values()) {
      if (session.organizationId === command.actor?.organizationId || command.segments[0] === 'worker') {
        const saved = await saveExternalSession(db, session);
        if (!saved) conflict = true;
      }
    }
    if (!conflict) return last;
  }
  return last;
}

/** Deletes storage, then the temporary rows, only after close/cancel/expiry, the upload window, and every stream lease. */
export async function purgeExternalSessions(
  db: DbExecutor,
  organizationId: string,
  now: Date,
  onlySessionId?: string,
): Promise<{ purged: string[]; kept: number }> {
  const root = objectRoot();
  if (!root) return { purged: [], kept: 0 };
  const rows = await db
    .select()
    .from(externalToolSessions)
    .where(
      onlySessionId
        ? and(eq(externalToolSessions.organizationId, organizationId), eq(externalToolSessions.id, onlySessionId))
        : eq(externalToolSessions.organizationId, organizationId),
    );
  const purged: string[] = [];
  for (const row of rows) {
    const streams = await db.select().from(externalToolStreams).where(eq(externalToolStreams.sessionId, row.id));
    const newest = streams.reduce<Date | null>(
      (max, stream) => (!max || stream.leaseUntil > max ? stream.leaseUntil : max),
      null,
    );
    if (
      !objectsReadyToDelete({
        status: row.status as SessionStatus,
        closedAt: row.closedAt,
        expiresAt: row.expiresAt,
        uploadWindowEndsAt: row.uploadWindowEndsAt,
        newestStreamLeaseUntil: newest,
        now,
      })
    ) {
      continue;
    }
    try {
      await rm(path.join(root, row.id), { recursive: true, force: true });
      await db.delete(externalToolStreams).where(eq(externalToolStreams.sessionId, row.id));
      await db.delete(externalToolEdits).where(eq(externalToolEdits.sessionId, row.id));
      await db.delete(externalToolXrefs).where(eq(externalToolXrefs.sessionId, row.id));
      await db.delete(externalToolParts).where(eq(externalToolParts.sessionId, row.id));
      await db.delete(externalToolFiles).where(eq(externalToolFiles.sessionId, row.id));
      await db.delete(externalToolObjects).where(eq(externalToolObjects.sessionId, row.id));
      await db.delete(externalToolSessions).where(eq(externalToolSessions.id, row.id));
      purged.push(row.id);
    } catch (error) {
      await db
        .update(externalToolSessions)
        .set({ status: 'purge_pending', purgeError: error instanceof Error ? error.message : 'purge_failed' })
        .where(eq(externalToolSessions.id, row.id));
    }
  }
  return { purged, kept: rows.length - purged.length };
}

export async function sessionBelongsToOrganization(db: DbExecutor, sessionId: string, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: externalToolSessions.id })
    .from(externalToolSessions)
    .where(and(eq(externalToolSessions.id, sessionId), eq(externalToolSessions.organizationId, organizationId)))
    .limit(1);
  return Boolean(row);
}
