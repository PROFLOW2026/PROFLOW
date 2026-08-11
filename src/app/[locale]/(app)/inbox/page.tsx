import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';

/** Alias for Command Center — prefer `/today`. */
export default async function InboxRedirectPage() {
  const locale = await getLocale();
  redirect({ href: '/today', locale });
}
