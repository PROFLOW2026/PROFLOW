import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';

/**
 * Shown when the environment has no Supabase or database credentials yet.
 * A fresh clone should explain itself rather than crash.
 */
export default async function SetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth.setup');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10 text-start">
      <Alert tone="warning" title={t('title')}>
        <p className="break-words">{t('body')}</p>
        <p className="mt-2 break-words text-xs">{t('docsHint')}</p>
      </Alert>
    </div>
  );
}
