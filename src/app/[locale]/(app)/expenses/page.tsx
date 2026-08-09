import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import type { BusinessDate } from '@/shared/dates';
import {
  listCostCategoriesForOrg,
  listExpensesForOrg,
  listExpensesSchema,
  listProjectsForOrg,
} from '@/modules/expenses';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { ExpensesList } from './expenses-list';

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
  const t = await getTranslations('expenses');
  const locale = await getLocale();
  const rawParams = await searchParams;

  const parsedFilters = listExpensesSchema.safeParse({
    dateFrom: rawParams.dateFrom,
    dateTo: rawParams.dateTo,
    projectId: rawParams.projectId,
    costFamily: rawParams.costFamily,
    costCategoryId: rawParams.costCategoryId,
    status: rawParams.status,
  });

  const filters = parsedFilters.success ? parsedFilters.data : {};
  const listFilters = {
    ...filters,
    dateFrom: filters.dateFrom as BusinessDate | undefined,
    dateTo: filters.dateTo as BusinessDate | undefined,
  };

  const [listResult, projects, categories] = await withOrgContext(async (context) => {
    const [expenses, projectRows, categoryRows] = await Promise.all([
      listExpensesForOrg(context, listFilters),
      listProjectsForOrg(context),
      listCostCategoriesForOrg(context),
    ]);
    return [expenses, projectRows, categoryRows] as const;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button asChild>
            <Link href="/expenses/new">
              <Plus aria-hidden />
              {t('actions.add')}
            </Link>
          </Button>
        }
      />

      <ExpensesList
        items={listResult.items}
        total={listResult.total}
        projects={projects}
        categories={categories}
        locale={locale}
        initialFilters={filters}
      />
    </div>
  );
}
