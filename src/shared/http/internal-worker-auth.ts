/**
 * Shared auth for trusted internal workers (OCR drain, recurring drafts).
 * Vercel cron / operators send `Authorization: Bearer $CRON_SECRET`.
 */
export function isInternalWorkerAuthorized(request: Request): boolean {
  const secret = process.env.OCR_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token.length > 0 && token === secret;
}
