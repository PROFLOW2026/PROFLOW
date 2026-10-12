'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { EXPERIENCE_SHOW_HIDDEN_PROJECT_TABS_COOKIE } from '../domain/experience-project-tabs-preference';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function readExperienceShowHiddenProjectTabsCookie(): Promise<boolean> {
  try {
    const jar = await cookies();
    const value = jar.get(EXPERIENCE_SHOW_HIDDEN_PROJECT_TABS_COOKIE)?.value;
    return value === '1' || value === 'true';
  } catch {
    return false;
  }
}

export async function setExperienceShowHiddenProjectTabsAction(show: boolean): Promise<void> {
  const jar = await cookies();
  if (show) {
    jar.set(EXPERIENCE_SHOW_HIDDEN_PROJECT_TABS_COOKIE, '1', {
      path: '/',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  } else {
    jar.delete(EXPERIENCE_SHOW_HIDDEN_PROJECT_TABS_COOKIE);
  }
  revalidatePath('/', 'layout');
}
