import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { accessibleSections } from './_lib/access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  const sections = await withOrgContext(async (context) => accessibleSections(context));
  const target = sections[0]?.href ?? '/settings/profile';
  redirect({ href: target, locale });
}
