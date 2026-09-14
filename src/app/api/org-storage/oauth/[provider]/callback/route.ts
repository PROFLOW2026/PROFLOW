import { completeStorageOAuth, failStorageOAuthCallback } from '@/modules/external-storage/server';
import type { StorageProviderKey } from '@/modules/external-storage/server';
import { STORAGE_PROVIDERS } from '@drizzle/schema/external-storage';
import { ProviderHttpError } from '@/modules/external-storage/providers/http-utils';
import { serverEnv } from '@/shared/env/server';

export const runtime = 'nodejs';

function isProvider(value: string): value is StorageProviderKey {
  return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  const settingsUrl = `${serverEnv().APP_URL.replace(/\/+$/, '')}/he-IL/settings/storage`;

  if (!isProvider(provider) || oauthError) {
    return Response.redirect(`${settingsUrl}?error=oauth_denied`, 302);
  }
  if (!code || !state) {
    return Response.redirect(`${settingsUrl}?error=oauth_missing`, 302);
  }

  try {
    await completeStorageOAuth({ provider, code, state });
    return Response.redirect(`${settingsUrl}?connected=${provider}`, 302);
  } catch (error) {
    const detail =
      error instanceof ProviderHttpError
        ? error.bodySnippet
        : error instanceof Error
          ? error.message
          : String(error);
    console.error('[org-storage/oauth/callback] failed', {
      provider,
      step: 'pre_connection_write',
      detail: detail.slice(0, 500),
    });
    await failStorageOAuthCallback({ provider, state, detail }).catch((markError) => {
      console.error('[org-storage/oauth/callback] could not mark connection error', markError);
    });
    return Response.redirect(`${settingsUrl}?error=oauth_failed`, 302);
  }
}
