import { createHash } from 'node:crypto';

/** True when every code unit fits in a Latin-1 / ISO-8859-1 byte. */
export function isLatin1FileName(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) > 255) return false;
  }
  return true;
}

/**
 * OneDrive Graph path uploads require a Latin-1-safe path segment on Vercel's
 * instrumented fetch. Non-Latin-1 display names upload under a stable ASCII
 * slug, then rename via JSON PATCH (Unicode in body is fine).
 */
export function toProviderUploadPathFileName(displayFileName: string): string {
  if (isLatin1FileName(displayFileName)) return displayFileName;

  const lastDot = displayFileName.lastIndexOf('.');
  const ext = lastDot >= 0 ? displayFileName.slice(lastDot).toLowerCase() : '';
  const digest = createHash('sha256').update(displayFileName).digest('hex').slice(0, 16);
  return `upload-${digest}${ext || '.bin'}`;
}
