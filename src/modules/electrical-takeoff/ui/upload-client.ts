/**
 * Chunked upload transport for takeoff plan files.
 * PUT `{uploadBase}/{fileId}` with x-takeoff-offset, x-takeoff-total, x-takeoff-session.
 */
export interface ChunkUploadProgress {
  readonly fileId: string;
  readonly uploadedBytes: number;
  readonly totalBytes: number;
}

export interface ChunkUploadResult {
  readonly fileId: string;
  readonly session: string | null;
}

export class TakeoffUploadError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'aborted' | 'server' | 'validation',
  ) {
    super(message);
    this.name = 'TakeoffUploadError';
  }
}

interface ChunkResponse {
  done: boolean;
  nextOffset: number;
  session: string | null;
}

const MAX_RETRIES = 3;

export async function uploadFileInChunks(input: {
  file: File;
  fileId: string;
  chunkBytes: number;
  uploadBase: string;
  onProgress?: (p: ChunkUploadProgress) => void;
  signal?: AbortSignal;
}): Promise<ChunkUploadResult> {
  const { file, fileId, chunkBytes, uploadBase, onProgress, signal } = input;
  let offset = 0;
  let session: string | null = null;
  const total = file.size;
  const url = `${uploadBase.replace(/\/$/, '')}/${fileId}`;

  while (offset < total) {
    if (signal?.aborted) throw new TakeoffUploadError('העלאה בוטלה', 'aborted');
    const end = Math.min(offset + chunkBytes, total);
    const slice = file.slice(offset, end);
    let attempt = 0;
    let lastError: unknown;
    while (attempt < MAX_RETRIES) {
      attempt += 1;
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/octet-stream',
          'x-takeoff-offset': String(offset),
          'x-takeoff-total': String(total),
        };
        if (session) headers['x-takeoff-session'] = session;
        const res = await fetch(url, {
          method: 'PUT',
          headers,
          body: slice,
          signal,
        });
        if (!res.ok) {
          throw new TakeoffUploadError(`שגיאת שרת (${res.status})`, 'server');
        }
        const json = (await res.json()) as ChunkResponse;
        offset = json.nextOffset;
        session = json.session ?? session;
        onProgress?.({ fileId, uploadedBytes: offset, totalBytes: total });
        if (json.done || offset >= total) {
          return { fileId, session };
        }
        break;
      } catch (err) {
        lastError = err;
        if (attempt >= MAX_RETRIES) {
          if (err instanceof TakeoffUploadError) throw err;
          throw new TakeoffUploadError('שגיאת רשת בהעלאה', 'network');
        }
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    if (offset < total && lastError && attempt >= MAX_RETRIES) {
      throw lastError;
    }
  }
  return { fileId, session };
}

export const TAKEOFF_MAX_FILE_BYTES = 120 * 1024 * 1024;

const EXTENSION_KIND: Record<string, 'pdf' | 'dwg' | 'dxf'> = {
  pdf: 'pdf',
  dwg: 'dwg',
  dxf: 'dxf',
};

export function inferTakeoffFileKind(fileName: string): 'pdf' | 'dwg' | 'dxf' | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  return EXTENSION_KIND[ext] ?? null;
}

export function validateTakeoffFile(file: File): { ok: true; kind: 'pdf' | 'dwg' | 'dxf' } | { ok: false; messageKey: string } {
  const kind = inferTakeoffFileKind(file.name);
  if (!kind) return { ok: false, messageKey: 'upload.errors.unsupportedType' };
  if (file.size > TAKEOFF_MAX_FILE_BYTES) return { ok: false, messageKey: 'upload.errors.tooLarge' };
  if (file.size <= 0) return { ok: false, messageKey: 'upload.errors.empty' };
  return { ok: true, kind };
}