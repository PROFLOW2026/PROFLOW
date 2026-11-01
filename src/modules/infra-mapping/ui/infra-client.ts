import type { InfraViewer } from '../domain/types';

/**
 * Client helpers shared by the workspace panels: file URLs per surface (owner / employee app use
 * the internal routes, contractors the contractor routes) and the byte upload to a ticket URL.
 */

export function evidenceFileUrl(viewer: InfraViewer, evidenceId: string): string {
  return viewer === 'internal'
    ? `/api/dg-files/download/evidence/${evidenceId}`
    : `/api/contractor/dg-files/download/evidence/${evidenceId}`;
}

export function storageFileUrl(projectId: string, providerFileId: string): string {
  const params = new URLSearchParams({ scope: 'project', projectId, fileId: providerFileId });
  return `/api/org-storage/browser-download?${params.toString()}`;
}

export interface UploadResult {
  readonly ok: boolean;
  readonly error?: string;
  /** True for failures that a retry cannot fix (bad type, too large). */
  readonly permanent?: boolean;
}

const UPLOAD_ERRORS: Readonly<Record<number, string>> = {
  400: 'הקובץ לא התקבל. נסו לצלם שוב.',
  401: 'ההתחברות פגה. התחברו מחדש ונסו שוב.',
  403: 'אין הרשאה להעלות לפרויקט הזה.',
  404: 'הרישום של התמונה לא נמצא. נסו שוב.',
  413: 'התמונה גדולה מדי.',
  415: 'סוג הקובץ אינו נתמך.',
  503: 'אחסון הענן לא זמין כרגע. נסו שוב.',
};

/** Step 2 of the two-step upload: the bytes go to the ticket's same-origin URL. */
export async function uploadBytes(uploadUrl: string, file: Blob, mimeType: string): Promise<UploadResult> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'content-type': mimeType },
      body: file,
      credentials: 'same-origin',
    });
    if (response.ok) return { ok: true };
    return {
      ok: false,
      error: UPLOAD_ERRORS[response.status] ?? 'ההעלאה נכשלה. נסו שוב.',
      permanent: response.status === 413 || response.status === 415,
    };
  } catch {
    return { ok: false, error: 'אין חיבור. הבדיקה תימשך כשהחיבור יחזור.' };
  }
}

export function normalizeUploadMime(file: Blob, fileName?: string): string {
  const declared = (file.type || '').toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared === 'image/jpg' ? 'image/jpeg' : declared;
  const ext = (fileName ?? '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    gif: 'image/gif',
  };
  return (ext && byExt[ext]) || 'image/jpeg';
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function newClientId(): string {
  return crypto.randomUUID();
}
