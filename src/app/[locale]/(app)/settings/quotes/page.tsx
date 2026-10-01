import { redirect } from '@/shared/i18n/navigation';

export default async function LegacyQuoteSettingsRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: '/quotes/settings', locale });
}
