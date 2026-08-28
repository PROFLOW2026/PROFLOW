import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('overheadHome.title') };
}

/** Legacy overhead hub — general business costs live on the expenses list. */
export default async function OverheadRedirectPage() {
  redirect({ href: '/expenses?costFamily=business_overhead', locale: await getLocale() });
}
