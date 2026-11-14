import type { WorkerJobRequest, WorkerResult } from './domain/contracts';

export interface TakeoffChunkSession {
  readonly fileId: string;
  readonly offset: number;
  readonly totalBytes: number;
  readonly sha256SoFar?: string;
}

export interface TakeoffFileStore {
  putChunk(
    input: {
      organizationId: string;
      projectId: string;
      fileId: string;
      offset: number;
      totalBytes: number;
      bytes: Uint8Array;
      session: TakeoffChunkSession | null;
    },
  ): Promise<{ done: boolean; nextOffset: number; session: string }>;
  finalize(input: {
    organizationId: string;
    projectId: string;
    fileId: string;
    fileName: string;
    mimeType: string;
    sha256: string;
    bytes: Uint8Array;
  }): Promise<{ documentId?: string }>;
  putArtifact?(input: {
    organizationId: string;
    projectId: string;
    artifactKey: string;
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ artifactKey: string; documentId?: string }>;
  openReadStream(input: {
    organizationId: string;
    fileId: string;
    rangeHeader: string | null;
  }): Promise<{ body: ReadableStream<Uint8Array>; contentType: string; contentLength: number | null }>;
}

export interface TakeoffWorkerClient {
  dispatch(request: WorkerJobRequest): Promise<{ accepted: boolean; workerJobId?: string }>;
  cancel(workerJobId: string): Promise<void>;
  exportAnnotatedPdf(body: unknown): Promise<Uint8Array>;
  exportBoqPdf(body: unknown): Promise<Uint8Array>;
}

export interface TakeoffClock {
  now(): Date;
}

export interface TakeoffIds {
  uuid(): string;
}

export interface TakeoffJobIngestResult {
  readonly jobId: string;
  readonly alreadyIngested: boolean;
}

export interface TakeoffWorkerCallbackPort {
  ingestResult(jobId: string, result: WorkerResult): Promise<TakeoffJobIngestResult>;
  ingestProgress(jobId: string, stage: string, percent: number, message?: string): Promise<void>;
  ingestArtifact(jobId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<{ artifactId: string }>;
}