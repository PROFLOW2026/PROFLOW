import { getLocale, getTranslations } from 'next-intl/server';
import { Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ExpensesOrgListView } from './expenses-org-list-view';

interface ExpensesOrgListPageProps {
  routeBase: string;
  surface?: 'owner' | 'employee';
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function ExpensesOrgListPage({
  routeBase,
  surface = 'owner',
  searchParams,
}: ExpensesOrgListPageProps) {
  const [t, locale, rawParams, tEmployee] = await Promise.all([
    getTranslations('expenses'),
    getLocale(),
    searchParams,
    surface === 'employee' ? getTranslations('employeeApp.expenses') : Promise.resolve(null),
  ]);

  if (surface === 'employee') {
    const canRead = await withOrgContext(async (context) =>
      employeeHasPermission(context, PERMISSIONS.EXPENSES_READ),
    );
    if (!canRead && tEmployee) {
      return (
        <div className="space-y-4">
          <EmptyState
            icon={Receipt}
            title={tEmployee('scopeLimited.title')}
            description={tEmployee('scopeLimited.description')}
          />
        </div>
      );
    }
  }

  const projectParam = typeof rawParams.projectId === 'string' ? rawParams.projectId : undefined;
  const legacyUnallocated = projectParam === 'unallocated';
  const parsedFilters = listExpensesSchema.safeParse({
    dateFrom: rawParams.dateFrom,
    dateTo: rawParams.dateTo,
    projectId: legacyUnallocated ? undefined : rawParams.projectId,
    costFamily: rawParams.costFamily,
    costCategoryId: rawParams.costCategoryId,
    status: rawParams.status,
    attention: rawParams.attention,
    unallocated: legacyUnallocated ? 'true' : rawParams.unallocated,
    cash: rawParams.cash,
    cashSource: rawParams.cashSource,
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

  const isOwnerSurface = surface === 'owner';
  const showSavedViews = isOwnerSurface;

  const canCreateExpense = await withOrgContext(async (context) =>
    surface === 'employee'
      ? employeeHasPermission(context, PERMISSIONS.EXPENSES_CREATE)
      : true,
  );

  const [listResult, projects, categories, attentionCount, today, scopeMeta] = await withOrgContext(
    async (context) => {
      if (isOwnerSurface) {
        const { ensureRecurringDraftOccurrencesForOrg } = await import(
          '@/modules/recurring-drafts/application/ensure-occurrences'
        );
        await ensureRecurringDraftOccurrencesForOrg(context);
      }

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
      return [
        expenses,
        projectRows,
        categoryRows,
        attentionTotal,
        todayInTimeZone(context.organization.timezone),
        expenses.scope,
      ] as const;
    },
  );

  const currentPage = resolveExpenseListPage(
    listResult.total,
    requestedPage,
    EXPENSE_LIST_PAGE_SIZE,
  );
  const pageCount = expenseListPageCount(listResult.total, EXPENSE_LIST_PAGE_SIZE);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {isOwnerSurface ? (
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
          actions={
            <div className="flex max-w-full flex-wrap gap-2">
              <Button asChild variant="secondary" className="max-w-full">
                <Link href="/expenses/received">{t('received.navLink')}</Link>
              </Button>
              <Button asChild variant="secondary" className="max-w-full">
                <Link href="/recurring-drafts?kind=expense">{t('actions.recurringExpenses')}</Link>
              </Button>
              <OcrEntryLink workflow="expense" />
              <Button asChild>
                <Link href={`${routeBase}/new`}>
                  <Plus aria-hidden />
                  {t('actions.add')}
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
          actions={
            canCreateExpense ? (
              <Button asChild>
                <Link href={`${routeBase}/new`}>
                  <Plus aria-hidden />
                  {tEmployee?.('create') ?? t('actions.add')}
                </Link>
              </Button>
            ) : null
          }
        />
      )}

      {showSavedViews ? (
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
            'cash',
            'cashSource',
            'page',
          ]}
        />
      ) : null}

      {showUnallocatedFilter ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-4 py-3 text-sm text-[var(--pf-status-warning-fg)]"
        >
          {t('list.unallocatedBannerTitle')}
        </div>
      ) : null}

      <ExpensesOrgListView
        routeBase={routeBase}
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
        scopeLimited={scopeMeta.scopeLimited}
        scopeEmpty={scopeMeta.scopeEmpty}
        initialFilters={{
          ...restFilters,
          statusFilter,
        }}
      />
    </div>
  );
}
