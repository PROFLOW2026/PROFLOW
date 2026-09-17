import { completeStorageOAuth, failStorageOAuthCallback } from '@/modules/external-storage/server';
import type { StorageProviderKey } from '@/modules/external-storage/server';
import {
  buildStorageOAuthSettingsRedirectUrl,
  resolveStorageOAuthCallbackLocale,
} from '@/modules/external-storage/application/oauth-callback-locale';
import { STORAGE_PROVIDERS } from '@drizzle/schema/external-storage';
import { ProviderHttpError } from '@/modules/external-storage/providers/http-utils';
import { serverEnv } from '@/shared/env/server';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';

function isProvider(value: string): value is StorageProviderKey {
  return (STORAGE_PROVIDERS as readonly string[]).includes(value);
}

function redirectToSettings(
  request: NextRequest,
  stateParam: string | null,
  query: string,
): Response {
  const origin = serverEnv().APP_URL;
  const locale = resolveStorageOAuthCallbackLocale(
    request.cookies.get(LOCALE_COOKIE_NAME)?.value,
    stateParam,
  );
  return Response.redirect(buildStorageOAuthSettingsRedirectUrl(origin, locale, query), 302);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (!isProvider(provider) || oauthError) {
    return redirectToSettings(request, state, 'error=oauth_denied');
  }
  if (!code || !state) {
    return redirectToSettings(request, state, 'error=oauth_missing');
  }

  try {
    await completeStorageOAuth({ provider, code, state });
    return redirectToSettings(request, state, `connected=${provider}`);
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
    return redirectToSettings(request, state, 'error=oauth_failed');
  }
}
