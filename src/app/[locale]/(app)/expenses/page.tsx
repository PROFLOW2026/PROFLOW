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
  type ListExpensesInput,
} from '@/modules/expenses';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import {
  isExpenseListAttentionStatusFilter,
  resolveExpenseListStatusFilterFromQuery,
} from '@/modules/expenses/domain/expense-status-filter';
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
  const [t, locale, rawParams] = await Promise.all([
    getTranslations('expenses'),
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
    attention: rawParams.attention,
    unallocated: rawParams.unallocated,
  });

  const filters: ListExpensesInput = parsedFilters.success
    ? parsedFilters.data
    : { unallocated: false };
  const { unallocated, attention: attentionParam, status, ...restFilters } = filters;
  const statusFilter = resolveExpenseListStatusFilterFromQuery({
    status,
    attention: attentionParam,
    unallocated,
  });
  const activeAttention = isExpenseListAttentionStatusFilter(statusFilter)
    ? statusFilter
    : undefined;
  const showUnallocatedFilter = statusFilter === 'project_allocation';
  const listFilters = {
    ...restFilters,
    dateFrom: restFilters.dateFrom as BusinessDate | undefined,
    dateTo: restFilters.dateTo as BusinessDate | undefined,
    unallocatedOnly: showUnallocatedFilter,
    attentionFilter: activeAttention,
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
              <Link href="/recurring-drafts?kind=expense">{t('actions.recurringExpenses')}</Link>
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
        keys={[
          'dateFrom',
          'dateTo',
          'projectId',
          'costFamily',
          'costCategoryId',
          'status',
          'attention',
          'unallocated',
        ]}
      />

      {showUnallocatedFilter ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm text-[var(--pf-status-warning-fg)]"
        >
          {t('list.unallocatedBannerTitle')}
        </div>
      ) : null}

      <ExpensesList
        items={listResult.items}
        total={listResult.total}
        projects={projects}
        categories={categories}
        locale={locale}
        initialFilters={{
          ...restFilters,
          statusFilter,
        }}
      />
    </div>
  );
}
