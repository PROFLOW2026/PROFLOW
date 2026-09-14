/**
 * Establish a real Supabase session for live E2E against localhost.
 *
 * Supabase magic links redirect to the production Site URL (hash tokens), so we
 * capture tokens from that redirect, then seed localhost SSR auth cookies.
 */

import { chromium } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';

function appOrigin() {
  return (process.env.APP_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anonKey || !serviceRole) {
    throw new Error('Supabase URL, anon key, or service role missing for E2E auth');
  }
  return { url, anonKey, serviceRole };
}

async function generateMagicLink(email) {
  const { url, serviceRole } = supabaseConfig();
  const res = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`generate_link failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const payload = await res.json();
  const actionLink = payload.action_link ?? payload.properties?.action_link;
  if (!actionLink) throw new Error('generate_link returned no action_link');
  return actionLink;
}

async function captureSessionFromMagicLink(actionLink) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(actionLink, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForTimeout(4000);
    const finalUrl = page.url();
    const hash = new URL(finalUrl).hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) {
      throw new Error(`magic link did not yield session tokens (final=${finalUrl.slice(0, 120)})`);
    }
    return { access_token, refresh_token };
  } finally {
    await browser.close();
  }
}

function buildAuthCookies(session) {
  const { url, anonKey } = supabaseConfig();
  const pending = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return pending.map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          pending.push(cookie);
        }
      },
    },
  });

  return supabase.auth.setSession(session).then(() => pending);
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {import('@playwright/test').Page} page
 * @param {string} email
 */
export async function signInViaAdminMagicLink(context, page, email) {
  const origin = appOrigin();
  const actionLink = await generateMagicLink(email);
  const session = await captureSessionFromMagicLink(actionLink);
  const authCookies = await buildAuthCookies(session);

  const host = new URL(origin).hostname;
  const normalizeSameSite = (value) => {
    const v = String(value ?? 'Lax').toLowerCase();
    if (v === 'strict') return 'Strict';
    if (v === 'none') return 'None';
    return 'Lax';
  };

  await context.addCookies(
    authCookies.map(({ name, value, options = {} }) => ({
      name,
      value,
      domain: host,
      path: options.path ?? '/',
      httpOnly: options.httpOnly ?? true,
      secure: options.secure ?? false,
      sameSite: normalizeSameSite(options.sameSite),
      expires: options.maxAge ? Math.floor(Date.now() / 1000) + options.maxAge : undefined,
    })),
  );

  await page.goto(`${origin}/he-IL/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[data-pf-shell="app"]').waitFor({ timeout: 120_000 });
}
