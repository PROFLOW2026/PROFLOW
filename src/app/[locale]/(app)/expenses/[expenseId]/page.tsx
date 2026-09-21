import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ExpensesOrgDetailPage } from '@/modules/expenses/ui/expenses-org-detail-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; expenseId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('detail.title') };
}

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ expenseId }, rawSearchParams] = await Promise.all([params, searchParams]);
  return (
    <ExpensesOrgDetailPage
      expenseId={expenseId}
      routeBase="/expenses"
      surface="owner"
      searchParams={rawSearchParams}
    />
  );
}
