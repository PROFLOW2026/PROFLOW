import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, type Locale } from './config';
import { loadMessages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = hasLocale(routing.locales, requested) ? requested : DEFAULT_LOCALE;

  return {
    locale,
    messages: await loadMessages(locale),
    // Organization time zone overrides this per layout once a tenant is active.
    timeZone: 'Asia/Jerusalem',
    formats: {
      dateTime: {
        short: { year: 'numeric', month: '2-digit', day: '2-digit' },
        medium: { year: 'numeric', month: 'short', day: 'numeric' },
      },
      number: {
        // Money columns need stable digit widths to scan vertically.
        tabular: { useGrouping: true },
      },
    },
  };
});
