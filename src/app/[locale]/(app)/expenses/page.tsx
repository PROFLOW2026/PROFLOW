import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import type { BusinessDate } from '@/shared/dates';
import { todayInTimeZone } from '@/shared/dates';
import {
  listCostCategoriesForOrg,
  listExpensesForOrg,
  listExpensesSchema,
  countExpensesNeedingAttentionForOrg,
  listProjectsForOrg,
  type ListExpensesInput,
} from '@/modules/expenses';
import {
  EXPENSE_LIST_PAGE_SIZE,
  expenseListOffset,
  resolveExpenseListPage,
  expenseListPageCount,
} from '@/modules/expenses/domain/expense-list-pagination';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import {
  isExpenseListAttentionStatusFilter,
  resolveExpenseListStatusFilterFromQuery,
  EXPENSE_LIST_STATUS_ALL,
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
    page: rawParams.page,
  });

  const filters: ListExpensesInput = parsedFilters.success
    ? parsedFilters.data
    : { unallocated: false };
  const { unallocated, attention: attentionParam, status, page: requestedPageRaw, ...restFilters } =
    filters;
  const requestedPage = requestedPageRaw ?? 1;
  const statusFilter = resolveExpenseListStatusFilterFromQuery({
    status,
    attention: attentionParam,
    unallocated,
  });
  const activeAttention = isExpenseListAttentionStatusFilter(statusFilter)
    ? statusFilter
    : undefined;
  const showUnallocatedFilter = statusFilter === 'project_allocation';
  const baseListFilters = {
    ...restFilters,
    dateFrom: restFilters.dateFrom as BusinessDate | undefined,
    dateTo: restFilters.dateTo as BusinessDate | undefined,
    unallocatedOnly: showUnallocatedFilter,
    attentionFilter: activeAttention,
  };

  const [listResult, projects, categories, attentionCount, today] = await withOrgContext(async (context) => {
    const provisional = await listExpensesForOrg(context, {
      ...baseListFilters,
      limit: EXPENSE_LIST_PAGE_SIZE,
      offset: expenseListOffset(requestedPage),
    });
    const currentPage = resolveExpenseListPage(
      provisional.total,
      requestedPage,
      EXPENSE_LIST_PAGE_SIZE,
    );
    const listPromise =
      currentPage === requestedPage
        ? Promise.resolve(provisional)
        : listExpensesForOrg(context, {
            ...baseListFilters,
            limit: EXPENSE_LIST_PAGE_SIZE,
            offset: expenseListOffset(currentPage),
          });
    const [expenses, projectRows, categoryRows, attentionTotal] = await Promise.all([
      listPromise,
      listProjectsForOrg(context),
      listCostCategoriesForOrg(context),
      statusFilter === EXPENSE_LIST_STATUS_ALL
        ? countExpensesNeedingAttentionForOrg(context)
        : Promise.resolve(0),
    ]);
    return [expenses, projectRows, categoryRows, attentionTotal, todayInTimeZone(context.organization.timezone)] as const;
  });

  const currentPage = resolveExpenseListPage(
    listResult.total,
    requestedPage,
    EXPENSE_LIST_PAGE_SIZE,
  );
  // today is now returned from withOrgContext for accurate timezone-based presets
  const pageCount = expenseListPageCount(listResult.total, EXPENSE_LIST_PAGE_SIZE);

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
          'page',
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
        currentPage={currentPage}
        pageCount={pageCount}
        pageSize={EXPENSE_LIST_PAGE_SIZE}
        attentionCount={attentionCount}
        projects={projects}
        categories={categories}
        locale={locale}
        today={today}
        initialFilters={{
          ...restFilters,
          statusFilter,
        }}
      />
    </div>
  );
}
