import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getLocale, getTranslations } from 'next-intl/server';
import { Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { todayInTimeZone } from '@/shared/dates';
import {
  listCostCategoriesForOrg,
  listExpensesForOrg,
  countExpensesNeedingAttentionForOrg,
  listProjectsForOrg,
} from '@/modules/expenses';
import {
  assembleExpenseListFilters,
  parseExpenseListSearchParams,
} from '@/modules/expenses/domain/expense-list-query';
import {
  EXPENSE_LIST_PAGE_SIZE,
  expenseListOffset,
  resolveExpenseListPage,
  expenseListPageCount,
} from '@/modules/expenses/domain/expense-list-pagination';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { EXPENSE_LIST_STATUS_ALL } from '@/modules/expenses/domain/expense-status-filter';
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
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
  const parsedQuery = parseExpenseListSearchParams({
    ...rawParams,
    projectId: legacyUnallocated ? undefined : rawParams.projectId,
    unallocated: legacyUnallocated ? 'true' : rawParams.unallocated,
  });
  const requestedPage = parsedQuery.page;
  const statusFilter = parsedQuery.statusFilter;
  const baseListFilters = assembleExpenseListFilters(parsedQuery);

  const isOwnerSurface = surface === 'owner';

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
    <MainAppPage>
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

      <MainAppSection>
      <ExpensesOrgListView
        routeBase={routeBase}
        surface={surface}
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
          dateFrom: parsedQuery.dateFrom,
          dateTo: parsedQuery.dateTo,
          dateBasis: parsedQuery.dateBasis,
          projectId: parsedQuery.projectId,
          costFamily: parsedQuery.costFamily,
          costCategoryId: parsedQuery.costCategoryId,
          statusFilter,
          cash: parsedQuery.cash,
          cashSource: parsedQuery.cashSource,
          q: parsedQuery.q,
        }}
      />
      </MainAppSection>
    </MainAppPage>
  );
}
