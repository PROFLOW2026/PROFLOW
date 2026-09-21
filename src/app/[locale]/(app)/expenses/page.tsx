import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExpensesOrgListPage } from '@/modules/expenses/ui/expenses-org-list-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('title') };
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ExpensesOrgListPage
      routeBase="/expenses"
      surface="owner"
      searchParams={searchParams}
    />
  );
}
