import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';

export default async function NotFound() {
  const t = await getTranslations('errors.notFoundPage');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('body')}</p>
      <Button asChild variant="secondary">
        <Link href="/">{t('backHome')}</Link>
      </Button>
    </div>
  );
}
