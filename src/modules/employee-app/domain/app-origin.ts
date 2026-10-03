import 'server-only';

import { serverEnv } from '@/shared/env/server';

/** Canonical employee share/login links — driven by configured public app URL. */
export function resolveEmployeeAppPublicOrigin(): string {
  const fromPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromPublic) return fromPublic.replace(/\/$/, '');

  try {
    return serverEnv().APP_URL.replace(/\/$/, '');
  } catch {
    return 'http://localhost:3000';
  }
}
