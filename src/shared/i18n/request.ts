import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, type Locale } from './config';
import { buildNextIntlFormats } from './intl-locale';
import { pfGetMessageFallback } from './message-fallback';
import { loadMessages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: await loadMessages(locale),
    getMessageFallback: pfGetMessageFallback,
    // Organization time zone overrides this per layout once a tenant is active.
    timeZone: 'Asia/Jerusalem',
    formats: buildNextIntlFormats(locale),
  };
});
