import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.portalAccess');
  return { title: t('title') };
}

export default async function PortalAccessPage() {
  const t = await getTranslations('auth.portalAccess');
  const cardClass =
    'flex min-h-11 flex-col justify-center rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3 text-sm font-medium text-[var(--pf-text-primary)] hover:bg-[var(--pf-action-subtle-hover)]';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <Link href="/employee/login" className={cardClass}>
          {t('employee')}
        </Link>
        <Link href="/contractor/sign-in" className={cardClass}>
          {t('contractor')}
        </Link>
      </div>
      <p className="text-sm text-[var(--pf-text-secondary)]">
        <Link href="/sign-in" className={textNavLinkClassName}>
          {t('backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
