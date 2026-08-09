import type { Metadata } from 'next';
import { redirect } from '@/shared/i18n/navigation';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { accessibleSections } from './_lib/access';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Settings' };
}

export default async function SettingsIndexPage() {
  const locale = await getLocale();
  const sections = await withOrgContext(async (context) => accessibleSections(context));
  const target = sections[0]?.href ?? '/settings/profile';
  redirect({ href: target, locale });
}
