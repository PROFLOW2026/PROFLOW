import { cookies } from 'next/headers';
import { Button } from '@/components/ui/button';
import { getRequestPathname } from '@/shared/http/request-pathname';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { documentLocale } from '@/shared/i18n/bare-path';
import { LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import arErrors from '@/locales/ar/errors.json';
import enErrors from '@/locales/en/errors.json';
import heErrors from '@/locales/he-IL/errors.json';
import ruErrors from '@/locales/ru/errors.json';

const NOT_FOUND_COPY: Record<Locale, { title: string; body: string; backHome: string }> = {
  'he-IL': heErrors.notFoundPage,
  en: enErrors.notFoundPage,
  ar: arErrors.notFoundPage,
  ru: ruErrors.notFoundPage,
};

/**
 * Unmatched routes outside a locale segment (and `notFound()` from the locale
 * layout) render here. Copy follows the URL locale, then the locale cookie.
 */
export default async function NotFound() {
  const cookieStore = await cookies();
  const pathname = await getRequestPathname();
  const locale = documentLocale(pathname, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const copy = NOT_FOUND_COPY[locale];
  const metadata = LOCALE_METADATA[locale];

  return (
    <div
      lang={metadata.htmlLang}
      dir={metadata.dir}
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pf-action-primary)] text-sm font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="text-lg font-semibold">ProjectFlow</span>
      </div>
      <h1 className="text-xl font-semibold">{copy.title}</h1>
      <p className="text-sm text-[var(--pf-text-secondary)]">{copy.body}</p>
      <Button asChild variant="secondary">
        <a href={`/${locale}`}>{copy.backHome}</a>
      </Button>
    </div>
  );
}
