import { INFRA_ERROR_MESSAGES } from '../domain/messages';
import {
  VIDEO_ENTITY_UPLOAD_HEADERS,
  nextChunk,
  type VideoChunkResponse,
} from '../domain/video';

/**
 * Browser side of the chunked video upload. The file never goes up in one request: each request
 * carries one chunk (a few MB) to `/api/infra/video-upload/:evidenceId`, which relays it to the
 * organization's cloud and answers where the transfer stands. The browser holds only an opaque
 * sealed `session` token - never a provider URL or credential.
 *
 * `state` survives between calls, so a retry after a dropped connection (or a manual retry) resumes
 * from the last confirmed offset instead of starting again.
 */

export interface VideoTransferState {
  offset: number;
  session: string | null;
}

export type VideoUploadResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string; readonly permanent?: boolean };

export interface UploadVideoInput {
  readonly uploadUrl: string;
  readonly file: Blob;
  readonly state: VideoTransferState;
  readonly onProgress?: (fraction: number) => void;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Attempts per chunk for connection / server hiccups (default 3). */
  readonly attemptsPerChunk?: number;
}

const FALLBACK_ERROR = 'ההעלאה נכשלה. נסו שוב.';
const NETWORK_ERROR = 'אין חיבור. ההעלאה תמשיך מאותה נקודה כשהחיבור יחזור.';

const STATUS_ERRORS: Readonly<Record<number, string>> = {
  401: 'ההתחברות פגה. התחברו מחדש ונסו שוב.',
  403: 'העלאת סרטונים זמינה כרגע למשתמשי המשרד בלבד.',
  404: 'הרישום של הסרטון לא נמצא. נסו שוב.',
  413: 'הסרטון גדול מדי.',
  503: 'אחסון הענן לא זמין כרגע. נסו שוב.',
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function messageFrom(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const key = typeof body?.error === 'string' ? body.error : '';
  return INFRA_ERROR_MESSAGES[key] ?? STATUS_ERRORS[response.status] ?? FALLBACK_ERROR;
}

export async function uploadVideoInChunks(input: UploadVideoInput): Promise<VideoUploadResult> {
  const doFetch = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attemptsPerChunk = input.attemptsPerChunk ?? 3;
  const total = input.file.size;
  const state = input.state;
  let restarted = false;
  let stalled = 0;

  for (;;) {
    const plan = nextChunk(total, state.offset);
    if (!plan) return { ok: false, error: FALLBACK_ERROR };
    const body = input.file.slice(plan.offset, plan.offset + plan.length);
    const headers: Record<string, string> = {
      'content-type': 'application/octet-stream',
      [VIDEO_ENTITY_UPLOAD_HEADERS.offset]: String(plan.offset),
      [VIDEO_ENTITY_UPLOAD_HEADERS.total]: String(total),
    };
    if (state.session) headers[VIDEO_ENTITY_UPLOAD_HEADERS.session] = state.session;

    let response: Response | null = null;
    for (let attempt = 1; attempt <= attemptsPerChunk; attempt += 1) {
      try {
        response = await doFetch(input.uploadUrl, { method: 'POST', headers, body, credentials: 'same-origin' });
      } catch {
        response = null;
      }
      if (response && !isRetryableStatus(response.status)) break;
      if (attempt < attemptsPerChunk) await sleep(800 * 2 ** (attempt - 1));
    }
    if (!response) return { ok: false, error: NETWORK_ERROR };

    if (!response.ok) {
      if (isRetryableStatus(response.status)) return { ok: false, error: await messageFrom(response) };
      // The sealed session may be stale (expired / rejected): start the transfer over exactly once.
      if (state.session && !restarted) {
        restarted = true;
        state.offset = 0;
        state.session = null;
        continue;
      }
      return { ok: false, error: await messageFrom(response), permanent: response.status === 413 };
    }

    const answer = (await response.json().catch(() => null)) as VideoChunkResponse | null;
    if (!answer || typeof answer.nextOffset !== 'number') return { ok: false, error: FALLBACK_ERROR };
    if (answer.done) {
      state.offset = total;
      state.session = null;
      input.onProgress?.(1);
      return { ok: true };
    }
    stalled = answer.nextOffset <= state.offset ? stalled + 1 : 0;
    if (stalled >= 3) return { ok: false, error: FALLBACK_ERROR };
    state.offset = Math.max(0, Math.min(answer.nextOffset, total));
    state.session = answer.session ?? state.session;
    input.onProgress?.(state.offset / total);
  }
}
