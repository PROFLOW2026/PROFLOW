import { beginStorageOAuth } from '@/modules/external-storage/server';
import type { StorageProviderKey } from '@/modules/external-storage/server';
import { STORAGE_PROVIDERS } from '@drizzle/schema/external-storage';
import { withOrgContext } from '@/shared/auth/session';

export const runtime = 'nodejs';

function isProvider(value: string): value is StorageProviderKey {
  return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  if (!isProvider(provider)) {
    return Response.json({ error: 'unknown_provider' }, { status: 400 });
  }

  const { authorizationUrl } = await withOrgContext((orgContext) =>
    beginStorageOAuth(orgContext, provider),
  );

  return Response.redirect(authorizationUrl, 302);
}
