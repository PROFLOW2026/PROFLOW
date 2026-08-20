'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { serverEnv } from '@/shared/env/server';
import {
  EXPERIENCE_PREVIEW_COOKIE,
  canUseExperiencePreview,
  parseExperiencePreviewSelection,
  type ExperiencePreviewSelection,
} from '../domain/experience-preview';

/**
 * Cookie-only Owner QA preview — never mutates organization configuration.
 */
export async function readExperiencePreviewCookie(): Promise<ExperiencePreviewSelection> {
  try {
    const jar = await cookies();
    return parseExperiencePreviewSelection(jar.get(EXPERIENCE_PREVIEW_COOKIE)?.value);
  } catch {
    // Integration/unit callers (and any non-request context) have no cookie store.
    return 'actual';
  }
}

/**
 * Sets or clears the experience preview cookie for the current Owner session.
 * Form field `preview`: profile key or `actual` to clear.
 *
 * Uses a dynamic session import so this module can be read from getShellContext
 * without a circular load-time dependency.
 */
export async function setExperiencePreviewAction(formData: FormData): Promise<void> {
  const { withOrgContext } = await import('@/shared/auth/session');
  const env = serverEnv();

  const allowed = await withOrgContext((context) =>
    Promise.resolve(
      canUseExperiencePreview(context.roleKeys, env.APP_ENV, env.PF_EXPERIENCE_PREVIEW),
    ),
  );
  if (!allowed) return;

  const raw = String(formData.get('preview') ?? '').trim();
  const selection = parseExperiencePreviewSelection(raw || 'actual');
  const jar = await cookies();

  if (selection === 'actual') {
    jar.delete(EXPERIENCE_PREVIEW_COOKIE);
  } else {
    jar.set(EXPERIENCE_PREVIEW_COOKIE, selection, {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 14,
    });
  }

  revalidatePath('/', 'layout');
}
