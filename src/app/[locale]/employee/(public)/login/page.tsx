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

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      <LocaleSwitcherInline className="mb-6" />
      <EmployeeLoginForm defaultUsername={defaultUsername} />
    </div>
  );
}
