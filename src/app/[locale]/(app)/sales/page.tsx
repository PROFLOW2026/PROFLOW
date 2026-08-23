import { redirect } from '@/shared/i18n/navigation';
import { getLocale } from 'next-intl/server';

/** Legacy sales hub — customer bids live on Quotes (R-015). */
export default async function SalesHubRedirectPage() {
  redirect({ href: '/quotes', locale: await getLocale() });
}
