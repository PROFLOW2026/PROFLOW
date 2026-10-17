import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmployeeLoginForm } from '@/modules/employee-app/ui/employee-login-form';
import { LocaleSwitcherInline } from '@/shared/i18n/locale-switcher-inline';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp' });
  return { title: t('login.title') };
}

export default async function EmployeeLoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams) ?? {};
  const defaultUsername =
    typeof raw.u === 'string'
      ? raw.u
      : typeof raw.username === 'string'
        ? raw.username
        : '';
  const tCommon = await getTranslations('common');

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <div className="mb-6 flex min-w-0 items-center justify-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pf-action-primary)] text-sm font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="min-w-0 truncate text-lg font-semibold">{tCommon('appName')}</span>
      </div>
      <LocaleSwitcherInline className="mb-6" />
      <EmployeeLoginForm defaultUsername={defaultUsername} />
    </div>
  );
}
