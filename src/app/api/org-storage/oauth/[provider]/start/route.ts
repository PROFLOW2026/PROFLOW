import { beginStorageOAuth } from '@/modules/external-storage/server';
import type { StorageProviderKey } from '@/modules/external-storage/server';
import { STORAGE_PROVIDERS } from '@drizzle/schema/external-storage';
import { withOrgContext } from '@/shared/auth/session';
import { LOCALE_COOKIE_NAME, resolveAuthLocale } from '@/shared/i18n/auth-locale';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

function isProvider(value: string): value is StorageProviderKey {
  return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isProvider(provider)) {
    return Response.json({ error: 'unknown_provider' }, { status: 400 });
  }

  const locale = resolveAuthLocale([request.cookies.get(LOCALE_COOKIE_NAME)?.value]);

  const { authorizationUrl } = await withOrgContext((orgContext) =>
    beginStorageOAuth(orgContext, provider, { locale }),
  );

  return Response.redirect(authorizationUrl, 302);
}
