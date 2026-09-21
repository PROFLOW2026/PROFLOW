/**
 * Auth for the storage provision worker only.
 * Uses STORAGE_PROVISION_WORKER_SECRET — does not share OCR/CRON secrets.
 */
export function resolveStorageProvisionWorkerSecret(): string | null {
  const secret = process.env.STORAGE_PROVISION_WORKER_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

export function isStorageProvisionWorkerAuthorized(request: Request): boolean {
  const secret = resolveStorageProvisionWorkerSecret();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token.length > 0 && token === secret;
}
