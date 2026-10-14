import { timingSafeEqual } from 'node:crypto';

/**
 * Shared auth for trusted internal workers (OCR drain, recurring drafts).
 * Vercel cron / operators send `Authorization: Bearer $CRON_SECRET`.
 * Each route accepts only the secret(s) defined for it (OD-53).
 */
export type InternalWorkerRoute =
  | 'ops-worker'
  | 'sumit-expense-worker'
  | 'dg-events-worker'
  | 'ocr-worker';

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function secretMatches(token: string, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected || !token) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function acceptedSecrets(route: InternalWorkerRoute): readonly string[] {
  const cron = process.env.CRON_SECRET?.trim();
  const ocr = process.env.OCR_WORKER_SECRET?.trim();
  switch (route) {
    case 'ocr-worker':
      return [cron, ocr].filter((value): value is string => Boolean(value));
    case 'ops-worker':
    case 'sumit-expense-worker':
    case 'dg-events-worker':
      return cron ? [cron] : [];
    default: {
      const _exhaustive: never = route;
      return _exhaustive;
    }
  }
}

export function isInternalWorkerAuthorized(
  request: Request,
  route: InternalWorkerRoute,
): boolean {
  const token = bearerToken(request);
  if (!token) return false;
  const secrets = acceptedSecrets(route);
  if (secrets.length === 0) return false;
  return secrets.some((secret) => secretMatches(token, secret));
}

/** Bearer secret for outbound kicks to a specific internal worker route. */
export function resolveInternalWorkerBearer(route: InternalWorkerRoute): string | null {
  const secrets = acceptedSecrets(route);
  return secrets[0] ?? null;
}
