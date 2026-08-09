import { apiSuccess } from '@/modules/api';

/** Lightweight health probe for the versioned API surface. No auth required. */
export async function GET() {
  return apiSuccess({ ok: true });
}
