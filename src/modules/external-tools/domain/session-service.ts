import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  PART_SIZE,
  SESSION_TTL_MS,
  UPLOAD_WINDOW_MS,
  objectsReadyToDelete,
  sessionReadable,
  statusAfterEdit,
  type SessionStatus,
} from './session-rules';

export interface SessionPart {
  sha256: string;
  locked: boolean;
  offset: number;
  size: number;
  bytes: Uint8Array | null;
}

export interface SessionXref {
  parentLogicalId: string;
  blockName: string;
  savedPath: string;
  resolvedLogicalId: string | null;
}

export interface SessionFile {
  logicalId: string;
  relativePath: string;
  role: 'host' | 'xref' | 'pdf' | 'dxf';
  size: number;
  sha256: string | null;
  partSize: number;
  parts: Map<number, SessionPart>;
}

export interface ToolSession {
  id: string;
  organizationId: string;
  userId: string | null;
  actorKind: 'member' | 'contractor';
  principalId: string | null;
  status: SessionStatus;
  stage: string | null;
  percent: number | null;
  message: string | null;
  workerLeaseUntil: Date | null;
  lastHeartbeatAt: Date | null;
  workerInstanceId: string | null;
  revision: number;
  /** Revision loaded from storage. A save matches only this value, so a stale read cannot overwrite a newer terminal. */
  persistedRevision: number;
  createdAt: Date;
  expiresAt: Date;
  uploadWindowEndsAt: Date;
  closedAt: Date | null;
  reviewedAt: Date | null;
  analysisFinishedAt: Date | null;
  workerJobId: string | null;
  analyzeRequestId: string | null;
  sourceTokenHash: string;
  resultTokenHash: string;
  progressTokenHash: string;
  terminalTokenHash: string;
  files: Map<string, SessionFile>;
  xrefs: Map<string, SessionXref>;
  edits: Array<{ seq: number; op: unknown; revisionAfter: number }>;
  sourceToken: string;
  resultToken: string;
  progressToken: string;
  terminalToken: string;
  cancelledTokenRotation: boolean;
  resultSha256: string | null;
  resultPayload: unknown;
  streamLeaseUntil: Date | null;
  purgeError: string | null;
  resultStoredAt: Date | null;
  terminalReceivedAt: Date | null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class ExternalSessionService {
  readonly sessions = new Map<string, ToolSession>();

  create(input: {
    organizationId: string;
    userId?: string | null;
    actorKind?: 'member' | 'contractor';
    principalId?: string | null;
    now?: Date;
  }): { session: ToolSession; tokens: Record<string, string> } {
    const now = input.now ?? new Date();
    const tokens = {
      source: randomBytes(24).toString('hex'),
      result: randomBytes(24).toString('hex'),
      progress: randomBytes(24).toString('hex'),
      terminal: randomBytes(24).toString('hex'),
    };
    const session: ToolSession = {
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId ?? null,
      actorKind: input.actorKind ?? 'member',
      principalId: input.principalId ?? null,
      status: 'uploading',
      stage: null,
      percent: null,
      message: null,
      workerLeaseUntil: null,
      lastHeartbeatAt: null,
      workerInstanceId: null,
      revision: 1,
      persistedRevision: 1,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      uploadWindowEndsAt: new Date(now.getTime() + UPLOAD_WINDOW_MS),
      closedAt: null,
      reviewedAt: null,
      analysisFinishedAt: null,
      workerJobId: null,
      analyzeRequestId: null,
      sourceTokenHash: hashToken(tokens.source),
      resultTokenHash: hashToken(tokens.result),
      progressTokenHash: hashToken(tokens.progress),
      terminalTokenHash: hashToken(tokens.terminal),
      files: new Map(),
      xrefs: new Map(),
      edits: [],
      sourceToken: tokens.source,
      resultToken: tokens.result,
      progressToken: tokens.progress,
      terminalToken: tokens.terminal,
      cancelledTokenRotation: false,
      resultSha256: null,
      resultPayload: null,
      streamLeaseUntil: null,
      purgeError: null,
      resultStoredAt: null,
      terminalReceivedAt: null,
    };
    this.sessions.set(session.id, session);
    return { session, tokens };
  }

  addFile(
    sessionId: string,
    file: Omit<SessionFile, 'parts' | 'sha256' | 'partSize'> & { sha256?: string | null; partSize?: number },
  ): SessionFile {
    const session = this.require(sessionId);
    const existing = session.files.get(file.logicalId);
    if (existing) return existing;
    const row: SessionFile = {
      ...file,
      sha256: file.sha256 ?? null,
      partSize: file.partSize ?? PART_SIZE,
      parts: new Map(),
    };
    session.files.set(file.logicalId, row);
    return row;
  }

  issueUploadUrl(sessionId: string, logicalId: string, partIndex: number): string {
    const file = this.require(sessionId).files.get(logicalId);
    if (!file) throw new Error('file_missing');
    const existing = file.parts.get(partIndex);
    if (existing?.locked) throw new Error('conflict');
    const offset = partIndex * file.partSize;
    const size = Math.min(file.partSize, file.size - offset);
    if (size <= 0) throw new Error('part_out_of_range');
    file.parts.set(partIndex, { sha256: '', locked: false, offset, size, bytes: null });
    return `${sessionId}/${logicalId}/${partIndex}/upload`;
  }

  lockPart(sessionId: string, logicalId: string, partIndex: number, sha256: string, bytes: Uint8Array | null = null): void {
    const file = this.require(sessionId).files.get(logicalId);
    if (!file) throw new Error('file_missing');
    const existing = file.parts.get(partIndex);
    if (existing?.locked && existing.sha256 === sha256) return;
    if (existing?.locked && existing.sha256 !== sha256) throw new Error('part_immutable');
    const offset = partIndex * file.partSize;
    const size = Math.min(file.partSize, file.size - offset);
    if (size <= 0) throw new Error('part_out_of_range');
    file.parts.set(partIndex, { sha256, locked: true, offset, size, bytes });
  }

  heartbeat(sessionId: string, token: string, instanceId: string, now = new Date()): void {
    const session = this.require(sessionId);
    if (hashToken(token) !== session.progressTokenHash) throw new Error('progress_token');
    if (session.status === 'cancelled' || session.closedAt) return;
    session.lastHeartbeatAt = now;
    session.workerLeaseUntil = new Date(now.getTime() + 2 * 60 * 1000);
    session.workerInstanceId = instanceId;
  }

  progress(sessionId: string, token: string, stage: string, percent: number, message: string | null, now = new Date()): void {
    const session = this.require(sessionId);
    if (hashToken(token) !== session.progressTokenHash) throw new Error('progress_token');
    if (session.status === 'cancelled' || session.closedAt) return;
    session.stage = stage;
    session.percent = percent;
    session.message = message;
    this.heartbeat(sessionId, token, session.workerInstanceId ?? 'worker', now);
  }

  analyze(sessionId: string, requestId: string, workerJobId: string): { workerJobId: string; created: boolean } {
    const session = this.require(sessionId);
    if (session.analyzeRequestId === requestId && session.workerJobId && ['queued', 'running', 'ready', 'reviewed'].includes(session.status)) {
      return { workerJobId: session.workerJobId, created: false };
    }
    session.analyzeRequestId = requestId;
    session.workerJobId = workerJobId;
    session.status = 'queued';
    session.revision += 1;
    return { workerJobId, created: true };
  }

  /** Plaintext callback tokens for this process. A session loaded from the database receives a fresh set. */
  ensureCallbackTokens(sessionId: string): { source: string; result: string; progress: string; terminal: string } {
    const session = this.require(sessionId);
    if (session.sourceToken && session.resultToken && session.progressToken && session.terminalToken) {
      return {
        source: session.sourceToken,
        result: session.resultToken,
        progress: session.progressToken,
        terminal: session.terminalToken,
      };
    }
    const tokens = {
      source: randomBytes(24).toString('hex'),
      result: randomBytes(24).toString('hex'),
      progress: randomBytes(24).toString('hex'),
      terminal: randomBytes(24).toString('hex'),
    };
    session.sourceToken = tokens.source;
    session.resultToken = tokens.result;
    session.progressToken = tokens.progress;
    session.terminalToken = tokens.terminal;
    session.sourceTokenHash = hashToken(tokens.source);
    session.resultTokenHash = hashToken(tokens.result);
    session.progressTokenHash = hashToken(tokens.progress);
    session.terminalTokenHash = hashToken(tokens.terminal);
    return tokens;
  }

  readLockedFile(sessionId: string, logicalId: string, now = new Date(), mode: 'worker' | 'export' = 'worker'): Uint8Array {
    const session = this.require(sessionId);
    const workerRead = session.status === 'queued' || session.status === 'running';
    const exportRead =
      mode === 'export' &&
      sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now });
    if (!workerRead && !exportRead) throw new Error('source_closed');
    const file = session.files.get(logicalId);
    if (!file) throw new Error('file_missing');
    const indexes = [...file.parts.keys()].sort((a, b) => a - b);
    const chunks: Uint8Array[] = [];
    let expected = 0;
    for (const index of indexes) {
      const part = file.parts.get(index);
      if (!part?.locked || !part.bytes || part.offset !== expected) throw new Error('part_missing');
      chunks.push(part.bytes);
      expected += part.bytes.byteLength;
    }
    if (expected !== file.size) throw new Error('part_missing');
    const merged = new Uint8Array(expected);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.openStream(sessionId, now);
    return merged;
  }

  edit(sessionId: string, seq: number, op: unknown): void {
    const session = this.require(sessionId);
    if (session.edits.some((row) => row.seq === seq)) return;
    session.reviewedAt = null;
    session.status = statusAfterEdit(session.status);
    session.revision += 1;
    session.edits.push({ seq, op, revisionAfter: session.revision });
  }

  owns(sessionId: string, actor: { organizationId: string; userId: string | null; principalId: string | null }): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.organizationId !== actor.organizationId) return false;
    if (session.actorKind === 'contractor') return session.principalId === actor.principalId;
    return session.userId === actor.userId;
  }

  chooseXref(sessionId: string, choice: SessionXref): void {
    const session = this.require(sessionId);
    if (session.status === 'running' || session.status === 'queued') throw new Error('conflict');
    if (choice.resolvedLogicalId && !session.files.has(choice.resolvedLogicalId)) throw new Error('file_missing');
    const key = `${choice.parentLogicalId}\u0000${choice.blockName}\u0000${choice.savedPath}`;
    session.xrefs.set(key, choice);
  }

  completeFile(sessionId: string, logicalId: string, sha256: string): void {
    const file = this.require(sessionId).files.get(logicalId);
    if (!file) throw new Error('file_missing');
    if (file.sha256 === sha256) return;
    const expected = Math.max(1, Math.ceil(file.size / file.partSize));
    let cursor = 0;
    for (let index = 0; index < expected; index += 1) {
      const part = file.parts.get(index);
      if (!part?.locked) throw new Error('part_missing');
      if (part.offset !== cursor) throw new Error('part_gap');
      cursor += part.size;
    }
    if (cursor !== file.size) throw new Error('part_gap');
    for (const part of file.parts.values()) {
      if (part.offset < 0 || part.offset + part.size > file.size) throw new Error('part_overlap');
    }
    const withBytes = [...Array(expected).keys()].map((index) => file.parts.get(index)?.bytes ?? null);
    if (withBytes.every((part) => part instanceof Uint8Array)) {
      const hash = createHash('sha256');
      for (const part of withBytes) hash.update(part!);
      if (hash.digest('hex') !== sha256) throw new Error('hash_mismatch');
    }
    file.sha256 = sha256;
  }

  readLockedPart(sessionId: string, logicalId: string, partIndex: number, now = new Date()): { sha256: string; offset: number; size: number } {
    const session = this.require(sessionId);
    if (!sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now })) {
      throw new Error('gone');
    }
    const part = session.files.get(logicalId)?.parts.get(partIndex);
    if (!part?.locked) throw new Error('part_missing');
    this.openStream(sessionId, now);
    return { sha256: part.sha256, offset: part.offset, size: part.size };
  }

  rotateCancelTokens(sessionId: string): { source: string; result: string } | null {
    const session = this.require(sessionId);
    if (session.cancelledTokenRotation) return null;
    const source = randomBytes(24).toString('hex');
    const result = randomBytes(24).toString('hex');
    session.sourceToken = source;
    session.resultToken = result;
    session.sourceTokenHash = hashToken(source);
    session.resultTokenHash = hashToken(result);
    session.cancelledTokenRotation = true;
    session.status = 'cancelled';
    session.closedAt = session.closedAt ?? new Date();
    session.revision += 1;
    return { source, result };
  }

  storeVerifiedResult(
    sessionId: string,
    sha256: string,
    now = new Date(),
    payload: unknown = null,
  ): { stored: boolean; ready: boolean } {
    const session = this.require(sessionId);
    if (session.status === 'cancelled' || session.status === 'expired' || session.closedAt) throw new Error('gone');
    if (session.resultStoredAt && session.resultSha256 === sha256) return { stored: false, ready: session.status === 'ready' };
    session.resultSha256 = sha256;
    session.resultStoredAt = now;
    if (payload && typeof payload === 'object') session.resultPayload = payload;
    return { stored: true, ready: false };
  }

  markReadyIfResultStored(sessionId: string, outcome: 'ready' | 'failed', token: string, now = new Date()): { stored: boolean } {
    const session = this.require(sessionId);
    if (hashToken(token) !== session.terminalTokenHash) throw new Error('terminal_token');
    if (session.terminalReceivedAt) return { stored: false };
    if (outcome === 'ready' && !session.resultStoredAt) throw new Error('result_incomplete');
    session.terminalReceivedAt = now;
    session.analysisFinishedAt = now;
    if (session.status === 'cancelled' || session.status === 'expired' || session.closedAt) return { stored: false };
    session.status = outcome;
    session.revision += 1;
    return { stored: true };
  }

  review(sessionId: string, now = new Date()): void {
    const session = this.require(sessionId);
    if (!sessionReadable({ status: session.status, expiresAt: session.expiresAt, closedAt: session.closedAt, now })) {
      throw new Error('session_closed');
    }
    session.reviewedAt = now;
    session.status = 'reviewed';
    session.revision += 1;
  }

  close(sessionId: string, now = new Date()): void {
    const session = this.require(sessionId);
    if (session.closedAt) return;
    session.closedAt = now;
    session.status = 'cancelled';
    session.revision += 1;
  }

  terminal(sessionId: string, token: string, outcome: 'ready' | 'failed', now = new Date()): { stored: boolean } {
    return this.markReadyIfResultStored(sessionId, outcome, token, now);
  }

  storeResult(sessionId: string, now = new Date()): { stored: boolean } {
    const session = this.require(sessionId);
    if (session.resultStoredAt) return { stored: false };
    session.resultStoredAt = now;
    return { stored: true };
  }

  openStream(sessionId: string, now = new Date()): void {
    const session = this.require(sessionId);
    session.streamLeaseUntil = new Date(now.getTime() + 60_000);
  }

  readyToPurge(sessionId: string, now = new Date()): boolean {
    const session = this.require(sessionId);
    return objectsReadyToDelete({
      status: session.status,
      closedAt: session.closedAt,
      expiresAt: session.expiresAt,
      uploadWindowEndsAt: session.uploadWindowEndsAt,
      newestStreamLeaseUntil: session.streamLeaseUntil,
      now,
    });
  }

  private require(sessionId: string): ToolSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('session_missing');
    return session;
  }
}

export function partCount(size: number): number {
  return Math.max(1, Math.ceil(size / PART_SIZE));
}
