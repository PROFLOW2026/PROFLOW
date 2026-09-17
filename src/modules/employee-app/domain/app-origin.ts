import 'server-only';

import { serverEnv } from '@/shared/env/server';

const CANONICAL_PRODUCTION_ORIGIN = 'https://proflow-two-bice.vercel.app';

/** Canonical employee share/login links — never preview/git-main aliases in production. */
export function resolveEmployeeAppPublicOrigin(): string {
  if (process.env.VERCEL_ENV === 'production') {
    return CANONICAL_PRODUCTION_ORIGIN;
  }

  const fromPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromPublic) return fromPublic.replace(/\/$/, '');

  try {
    return serverEnv().APP_URL.replace(/\/$/, '');
  } catch {
    return CANONICAL_PRODUCTION_ORIGIN;
  }
}
