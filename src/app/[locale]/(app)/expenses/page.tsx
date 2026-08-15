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
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
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
  const [t, tNavFrom, locale, rawParams] = await Promise.all([
    getTranslations('expenses'),
    getTranslations('recurringDrafts').then((tr) => tr('navFromSource')),
    getLocale(),
    searchParams,
  ]);

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
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            <Button asChild variant="secondary" className="max-w-full">
              <Link href="/recurring-drafts?kind=expense">{tNavFrom}</Link>
            </Button>
            <OcrEntryLink workflow="expense" />
            <Button asChild>
              <Link href="/expenses/new">
                <Plus aria-hidden />
                {t('actions.add')}
              </Link>
            </Button>
          </div>
        }
      />

      <SavedListViewsBar
        listKey="expenses"
        searchParams={rawParams}
        keys={['dateFrom', 'dateTo', 'projectId', 'costFamily', 'costCategoryId', 'status']}
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
