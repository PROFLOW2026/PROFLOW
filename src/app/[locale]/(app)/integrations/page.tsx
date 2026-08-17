import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';

export default async function IntegrationsRedirectPage() {
  const locale = await getLocale();
  redirect({ href: '/settings/integrations', locale });
}
