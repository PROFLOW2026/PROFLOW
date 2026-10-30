'use client';

import {
  AdaptiveListBody,
  AdaptiveListTableShell,
  MainAppCompactListCard,
  MainAppStandardListFilters,
} from '@/components/patterns/main-app';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Receipt } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { ContextualInfoLabel } from '@/components/ui/contextual-info';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { Button } from '@/components/ui/button';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { OwnerFilterField } from '@/shared/ui/owner-list-filter-bar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSearchParams } from 'next/navigation';
import { Link, usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { formatBusinessDate } from '@/shared/dates/format';
import type {
  CostCategoryRow,
  CostFamily,
  ExpenseSummary,
  ProjectOption,
} from '@/modules/expenses/domain/types';
import {
  expenseAttentionFocusParam,
  expenseListShowsAttentionColumns,
  listExpenseAttentionRequired,
  type resolveExpenseAttentionRequired,
} from '@/modules/expenses/domain/expense-attention';
import {
  EXPENSE_LIST_STATUS_ALL,
  EXPENSE_LIST_STATUS_FILTER_OPTIONS,
  expenseListStatusFilterIsActive,
  expenseListStatusFilterToSearchParams,
  isExpenseListAttentionStatusFilter,
  type ExpenseListStatusFilter,
} from '@/modules/expenses/domain/expense-status-filter';
import {
  buildCurrentPathReturnTo,
  EXPENSE_RETURN_TO_PARAM,
  parseSafeInternalReturnTo,
  type ExpenseDetailFocusParam,
} from '@/modules/expenses/domain/expense-return-navigation';
import { ExpenseAttentionIndicator } from '@/modules/expenses/ui/expense-attention-indicator';
import { Pagination } from '@/components/ui/pagination';
import { statusShape } from '@/modules/expenses/domain/lifecycle';
import { expenseListLabel, expenseSupplierDisplay } from '@/modules/expenses/ui/expense-list-label';

function statusFilterLabel(
  value: Exclude<ExpenseListStatusFilter, typeof EXPENSE_LIST_STATUS_ALL>,
  t: (key: string) => string,
  tStatus: (key: string) => string,
): string {
  if (value === 'finalized' || value === 'void') {
    return tStatus(`expense.${value}`);
  }
  return t(`attention.options.${value}`);
}

export interface ExpensesOrgListViewProps {
  readonly routeBase: string;
  readonly items: ExpenseSummary[];
  readonly total: number;
  readonly currentPage: number;
  readonly pageCount: number;
  readonly pageSize: number;
  readonly attentionCount: number;
  readonly projects: ProjectOption[];
  readonly categories: CostCategoryRow[];
  readonly locale: string;
  readonly initialFilters: {
    dateFrom?: string;
    dateTo?: string;
    dateBasis?: 'expense' | 'payment';
    projectId?: string;
    costFamily?: CostFamily;
    costCategoryId?: string;
    statusFilter?: ExpenseListStatusFilter;
    cash?: 'open' | 'paid';
    cashSource?: 'suppliers' | 'subcontractors';
    q?: string;
  };
  /** Server-supplied today for timezone-accurate presets in DateRangeSelector. */
  today?: string;
  scopeLimited?: boolean;
  scopeEmpty?: boolean;
  surface?: 'owner' | 'employee';
}

function buildRouteExpenseDetailHref(
  routeBase: string,
  expenseId: string,
  options: {
    readonly focus?: ExpenseDetailFocusParam;
    readonly returnTo?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  if (options.focus) params.set('focus', options.focus);
  const safeReturnTo = options.returnTo ? parseSafeInternalReturnTo(options.returnTo) : null;
  if (safeReturnTo) params.set(EXPENSE_RETURN_TO_PARAM, safeReturnTo);
  const query = params.toString();
  return query ? `${routeBase}/${expenseId}?${query}` : `${routeBase}/${expenseId}`;
}

function buildRouteExpenseAttentionActionHref(
  routeBase: string,
  expenseId: string,
  required: ReturnType<typeof resolveExpenseAttentionRequired>,
  options: { readonly returnTo?: string | null } = {},
): string {
  return buildRouteExpenseDetailHref(routeBase, expenseId, {
    focus: required ? expenseAttentionFocusParam(required) : undefined,
    returnTo: options.returnTo,
  });
}

export function ExpensesOrgListView({
  routeBase,
  items,
  total,
  currentPage,
  pageCount,
  pageSize: _pageSize,
  attentionCount,
  projects,
  categories,
  locale,
  initialFilters,
  today,
  scopeLimited = false,
  scopeEmpty = false,
  surface = 'owner',
}: ExpensesOrgListViewProps) {
  const t = useTranslations('expenses');
  const tStatus = useTranslations('status');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listReturnTo = React.useMemo(
    () => buildCurrentPathReturnTo(pathname, searchParams),
    [pathname, searchParams],
  );

  const [dateFrom, setDateFrom] = React.useState(initialFilters.dateFrom ?? '');
  const [dateTo, setDateTo] = React.useState(initialFilters.dateTo ?? '');
  const [dateBasis, setDateBasis] = React.useState<'expense' | 'payment'>(
    initialFilters.dateBasis ?? 'expense',
  );
  const [projectId, setProjectId] = React.useState(initialFilters.projectId ?? EXPENSE_LIST_STATUS_ALL);
  const [costFamily, setCostFamily] = React.useState(initialFilters.costFamily ?? EXPENSE_LIST_STATUS_ALL);
  const [costCategoryId, setCostCategoryId] = React.useState(
    initialFilters.costCategoryId ?? EXPENSE_LIST_STATUS_ALL,
  );
  const [statusFilter, setStatusFilter] = React.useState<ExpenseListStatusFilter>(
    initialFilters.statusFilter ?? EXPENSE_LIST_STATUS_ALL,
  );
  const [cash, setCash] = React.useState<string>(initialFilters.cash ?? EXPENSE_LIST_STATUS_ALL);
  const [cashSource, setCashSource] = React.useState<string>(
    initialFilters.cashSource ?? EXPENSE_LIST_STATUS_ALL,
  );
  const [query, setQuery] = React.useState(initialFilters.q ?? '');
  const [isApplying, startApplyTransition] = React.useTransition();
  const serverFilterKey = [
    initialFilters.dateFrom ?? '',
    initialFilters.dateTo ?? '',
    initialFilters.dateBasis ?? 'expense',
    initialFilters.projectId ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.costFamily ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.costCategoryId ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.statusFilter ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.cash ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.cashSource ?? EXPENSE_LIST_STATUS_ALL,
    initialFilters.q ?? '',
  ].join('\u0000');
  const [seenServerFilterKey, setSeenServerFilterKey] = React.useState(serverFilterKey);
  if (serverFilterKey !== seenServerFilterKey) {
    setSeenServerFilterKey(serverFilterKey);
    setDateFrom(initialFilters.dateFrom ?? '');
    setDateTo(initialFilters.dateTo ?? '');
    setDateBasis(initialFilters.dateBasis ?? 'expense');
    setProjectId(initialFilters.projectId ?? EXPENSE_LIST_STATUS_ALL);
    setCostFamily(initialFilters.costFamily ?? EXPENSE_LIST_STATUS_ALL);
    setCostCategoryId(initialFilters.costCategoryId ?? EXPENSE_LIST_STATUS_ALL);
    setStatusFilter(initialFilters.statusFilter ?? EXPENSE_LIST_STATUS_ALL);
    setCash(initialFilters.cash ?? EXPENSE_LIST_STATUS_ALL);
    setCashSource(initialFilters.cashSource ?? EXPENSE_LIST_STATUS_ALL);
    setQuery(initialFilters.q ?? '');
  }

  const activeAttention = isExpenseListAttentionStatusFilter(statusFilter)
    ? statusFilter
    : undefined;
  const showAttentionColumns = expenseListShowsAttentionColumns(activeAttention);

  function buildFilterParams(nextStatusFilter?: ExpenseListStatusFilter, page = 1) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if ((dateFrom || dateTo) && dateBasis === 'payment') params.set('dateBasis', 'payment');
    if (projectId !== EXPENSE_LIST_STATUS_ALL) params.set('projectId', projectId);
    if (costFamily !== EXPENSE_LIST_STATUS_ALL) params.set('costFamily', costFamily);
    if (costCategoryId !== EXPENSE_LIST_STATUS_ALL) params.set('costCategoryId', costCategoryId);

    const filterValue = nextStatusFilter ?? statusFilter;
    if (filterValue !== EXPENSE_LIST_STATUS_ALL) {
      const statusParams = expenseListStatusFilterToSearchParams(filterValue);
      statusParams.forEach((value, key) => params.set(key, value));
    }
    if (cash !== EXPENSE_LIST_STATUS_ALL) params.set('cash', cash);
    if (cashSource !== EXPENSE_LIST_STATUS_ALL) params.set('cashSource', cashSource);
    const trimmedQuery = query.trim();
    if (trimmedQuery) params.set('q', trimmedQuery);
    if (page > 1) params.set('page', String(page));
    return params;
  }

  function listHref(page = 1, nextStatusFilter?: ExpenseListStatusFilter) {
    const params = buildFilterParams(nextStatusFilter, page);
    const qs = params.toString();
    return qs ? `${routeBase}?${qs}` : routeBase;
  }

  function applyFilters() {
    startApplyTransition(() => {
      router.push(listHref(1));
    });
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setDateBasis('expense');
    setProjectId(EXPENSE_LIST_STATUS_ALL);
    setCostFamily(EXPENSE_LIST_STATUS_ALL);
    setCostCategoryId(EXPENSE_LIST_STATUS_ALL);
    setStatusFilter(EXPENSE_LIST_STATUS_ALL);
    setCash(EXPENSE_LIST_STATUS_ALL);
    setCashSource(EXPENSE_LIST_STATUS_ALL);
    setQuery('');
    startApplyTransition(() => {
      router.push(routeBase);
    });
  }

  function goToPage(page: number) {
    router.push(listHref(page));
  }

  function resolveRowIssues(expense: ExpenseSummary) {
    return listExpenseAttentionRequired(expense, {
      assumeProjectAllocation: activeAttention === 'project_allocation',
    });
  }

  function openAttentionFilterFromSummary() {
    setStatusFilter('any');
    startApplyTransition(() => {
      router.push(listHref(1, 'any'));
    });
  }

  function clearAttentionFilter() {
    setStatusFilter(EXPENSE_LIST_STATUS_ALL);
    router.push(listHref(1, EXPENSE_LIST_STATUS_ALL));
  }

  if (scopeEmpty && items.length === 0 && !hasActiveFilters(initialFilters)) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('list.scopeLimited.title')}
        description={t('list.scopeLimited.description')}
      />
    );
  }

  if (items.length === 0 && !hasActiveFilters(initialFilters)) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('list.empty.title')}
        description={t('list.empty.description')}
        action={
          <Button asChild>
            <Link href={`${routeBase}/new`}>{t('list.empty.action')}</Link>
          </Button>
        }
      />
    );
  }

  const filtersActive = hasActiveFilters(initialFilters);
  const statusSelectValue = statusFilter === 'any' ? EXPENSE_LIST_STATUS_ALL : statusFilter;
  const appliedActiveCount = countExpenseListActiveFilters(initialFilters);
  const appliedActiveSummary = buildExpenseListActiveSummary(initialFilters, {
    projects,
    categories,
    t,
    tStatus,
  });

  return (
    <div className="flex min-w-0 flex-col gap-3">
        {scopeLimited && !scopeEmpty ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]"
        >
          {t('list.scopeLimited.banner')}
        </div>
      ) : null}

      <AdaptiveListBody surface={surface}>
      <MainAppStandardListFilters
        title={t('list.filterPanelTitle')}
        applyLabel={tCommon('actions.filter')}
        clearLabel={tCommon('actions.clearFilters')}
        activeLabel={t('list.activeFilters')}
        mobileLabel={tCommon('actions.filter')}
        mobileWithCountLabel={t('list.mobileWithCount', { count: appliedActiveCount })}
        searchLabel={tCommon('actions.search')}
        searchPlaceholder={t('list.searchPlaceholder')}
        query={query}
        onQueryChange={setQuery}
        activeCount={appliedActiveCount}
        isActive={filtersActive}
        activeSummary={appliedActiveSummary}
        onApply={applyFilters}
        onClear={clearFilters}
        advancedFilters={
          <>
            <div className="min-w-0">
              <ContextualInfoLabel
                label={t('filters.dateBasis')}
                hint={dateBasis === 'payment' ? t('filters.paymentDateHint') : t('filters.expenseDateHint')}
              />
              <DateRangeSelector
                today={today}
                from={dateFrom}
                to={dateTo}
                onFromChange={setDateFrom}
                onToChange={setDateTo}
                fromName="dateFrom"
                toName="dateTo"
                labels={{
                  from: dateBasis === 'payment' ? t('filters.paymentDateFrom') : t('filters.dateFrom'),
                  to: dateBasis === 'payment' ? t('filters.paymentDateTo') : t('filters.dateTo'),
                }}
              />
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <OwnerFilterField label={t('filters.dateBasis')}>
                <Select
                  value={dateBasis}
                  onValueChange={(value) => setDateBasis(value as 'expense' | 'payment')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">{t('filters.dateBasisExpense')}</SelectItem>
                    <SelectItem value="payment">{t('filters.dateBasisPayment')}</SelectItem>
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.project')}>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.allProjects')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.allProjects')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.family')}>
                <Select
                  value={costFamily}
                  onValueChange={(value) =>
                    setCostFamily(value as CostFamily | typeof EXPENSE_LIST_STATUS_ALL)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.allFamilies')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.allFamilies')}</SelectItem>
                    {(['direct_project', 'shared', 'business_overhead', 'asset_capital'] as const).map(
                      (family) => (
                        <SelectItem key={family} value={family}>
                          {t(`costFamilies.${family}`)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.category')}>
                <Select value={costCategoryId} onValueChange={setCostCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.allCategories')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.allCategories')}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {displayCostCategoryName(category, (key) => t(key))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.status')}>
                <Select
                  value={statusSelectValue}
                  onValueChange={(value) => setStatusFilter(value as ExpenseListStatusFilter)}
                >
                  <SelectTrigger id="expenses-status-filter">
                    <SelectValue placeholder={t('filters.allStatuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.allStatuses')}</SelectItem>
                    {EXPENSE_LIST_STATUS_FILTER_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {statusFilterLabel(value, t, tStatus)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.cash')}>
                <Select value={cash} onValueChange={setCash}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.cashAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.cashAll')}</SelectItem>
                    <SelectItem value="open">{t('filters.cashOpen')}</SelectItem>
                    <SelectItem value="paid">{t('filters.cashPaid')}</SelectItem>
                  </SelectContent>
                </Select>
              </OwnerFilterField>

              <OwnerFilterField label={t('filters.cashSource')}>
                <Select value={cashSource} onValueChange={setCashSource}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('filters.cashSourceAll')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EXPENSE_LIST_STATUS_ALL}>{t('filters.cashSourceAll')}</SelectItem>
                    <SelectItem value="suppliers">{t('filters.cashSourceSuppliers')}</SelectItem>
                    <SelectItem value="subcontractors">{t('filters.cashSourceSubcontractors')}</SelectItem>
                  </SelectContent>
                </Select>
              </OwnerFilterField>
            </div>
          </>
        }
      />

      {activeAttention ? (
        <div
          role="status"
          className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-sm text-[var(--pf-status-warning-fg)]"
        >
          <span className="font-medium">{t('filters.attentionActiveLabel')}</span>
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-current/30 bg-[var(--pf-bg-elevated)] px-3 py-1 text-[var(--pf-text-primary)]">
            <span className="truncate">{t(`attention.options.${activeAttention}`)}</span>
            <button
              type="button"
              className="shrink-0 rounded-sm px-1 text-base leading-none hover:bg-[var(--pf-bg-muted)]"
              onClick={clearAttentionFilter}
              aria-label={t('attention.clearFilter')}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}

      {!activeAttention && attentionCount > 0 ? (
        <button
          type="button"
          onClick={openAttentionFilterFromSummary}
          className="w-full rounded-lg border border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] px-3 py-2 text-start text-sm font-medium text-[var(--pf-status-warning-fg)] transition-colors hover:bg-[var(--pf-status-warning-bg)]/80"
        >
          {t('attention.summaryStrip', { count: attentionCount })}
        </button>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.resultCount', { count: total })}</p>
        {filtersActive ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} loading={isApplying}>
            {tCommon('actions.clearFilters')}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{tCommon('states.noResults')}</p>
      ) : (
        <>
          <ResponsiveTable
            items={items}
            getRowKey={(expense) => expense.id}
            mobileListClassName={surface === 'owner' ? 'pf-ma-compact-mobile-list' : undefined}
            desktop={
              <AdaptiveListTableShell surface={surface}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.date')}</TableHead>
                      <TableHead>{t('fields.supplier')}</TableHead>
                      <TableHead>{t('fields.description')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('fields.project')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('fields.costFamily')}</TableHead>
                      <TableHead numeric>{t('fields.amount')}</TableHead>
                      <TableHead>{t('fields.status')}</TableHead>
                      {showAttentionColumns ? (
                        <>
                          <TableHead>{t('list.actionRequired')}</TableHead>
                          <TableHead className="w-[7rem]">{t('list.rowAction')}</TableHead>
                        </>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((expense) => {
                      const rowIssues = resolveRowIssues(expense);
                      const rowAttention = rowIssues[0] ?? null;
                      const needsCategory = rowIssues.includes('classification');
                      const actionHref = buildRouteExpenseAttentionActionHref(
                        routeBase,
                        expense.id,
                        rowAttention,
                        { returnTo: listReturnTo },
                      );
                      const categoryHref = buildRouteExpenseDetailHref(routeBase, expense.id, {
                        focus: 'classification',
                        returnTo: listReturnTo,
                      });
                      const rowHref = buildRouteExpenseDetailHref(routeBase, expense.id, {
                        returnTo: listReturnTo,
                      });
                      return (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <Link
                            href={rowHref}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            <span dir="ltr">
                              {formatBusinessDate(expense.expenseDate, locale, 'short')}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-start">
                          {expenseSupplierDisplay(expense)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-start">
                          {expenseListLabel(expense, t)}
                        </TableCell>
                        <TableCell className="hidden max-w-[12rem] truncate md:table-cell">
                          {expense.projectName ?? t('targeting.overhead')}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {t(`costFamilies.${expense.costFamily}`)}
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={expense.grossAmount} />
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <StatusBadge
                              shape={statusShape(expense.status)}
                              label={tStatus(`expense.${expense.status}`)}
                            />
                            {rowIssues.length > 0 && !showAttentionColumns ? (
                              rowIssues.map((issue) => (
                                <ExpenseAttentionIndicator key={issue} attention={issue} compact />
                              ))
                            ) : null}
                            {needsCategory && !showAttentionColumns ? (
                              <Button asChild variant="secondary" size="sm">
                                <Link href={categoryHref}>{t('attention.chooseCategory')}</Link>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        {showAttentionColumns ? (
                          <>
                            <TableCell className="text-start">
                              {rowIssues.length > 0 ? (
                                <ul className="flex flex-col gap-1">
                                  {rowIssues.map((issue) => (
                                    <li key={issue} className="text-sm font-medium text-[var(--pf-status-warning-fg)]">
                                      {t(`attention.required.${issue}`)}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <span className="text-[var(--pf-text-muted)]">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-2">
                                {rowAttention ? (
                                  <Button asChild variant="secondary" size="sm">
                                    <Link href={actionHref}>
                                      {rowAttention === 'classification'
                                        ? t('attention.chooseCategory')
                                        : t('attention.rowAction')}
                                    </Link>
                                  </Button>
                                ) : null}
                                {needsCategory && rowAttention !== 'classification' ? (
                                  <Button asChild variant="secondary" size="sm">
                                    <Link href={categoryHref}>{t('attention.chooseCategory')}</Link>
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </>
                        ) : null}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </AdaptiveListTableShell>
            }
            renderMobileCard={(expense) => {
              const rowIssues = resolveRowIssues(expense);
              const rowAttention = rowIssues[0] ?? null;
              const needsCategory = rowIssues.includes('classification');
              const actionHref = buildRouteExpenseAttentionActionHref(
                routeBase,
                expense.id,
                rowAttention,
                { returnTo: listReturnTo },
              );
              const categoryHref = buildRouteExpenseDetailHref(routeBase, expense.id, {
                focus: 'classification',
                returnTo: listReturnTo,
              });
              const rowHref = buildRouteExpenseDetailHref(routeBase, expense.id, {
                returnTo: listReturnTo,
              });
              return (
              <MainAppCompactListCard>
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={rowHref}
                    className={cn(textNavLinkClassName, 'min-w-0 flex-1 font-semibold')}
                  >
                    <span dir="ltr">
                      {formatBusinessDate(expense.expenseDate, locale, 'short')}
                    </span>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusBadge
                      shape={statusShape(expense.status)}
                      label={tStatus(`expense.${expense.status}`)}
                    />
                    {rowIssues.length > 0 && !showAttentionColumns
                      ? rowIssues.map((issue) => (
                          <ExpenseAttentionIndicator key={issue} attention={issue} compact />
                        ))
                      : null}
                  </div>
                </div>
                <p className="mt-1 truncate text-start text-sm text-[var(--pf-text-secondary)]">
                  {expenseListLabel(expense, t)}
                </p>
                <p className="mt-1 truncate text-start text-sm">
                  <span className="text-[var(--pf-text-muted)]">{t('fields.supplier')}: </span>
                  {expenseSupplierDisplay(expense)}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-[var(--pf-text-secondary)]">
                    {expense.projectName ?? t('targeting.overhead')}
                  </span>
                  <MoneyText value={expense.grossAmount} />
                </div>
                {showAttentionColumns && rowIssues.length > 0 ? (
                  <div className="mt-3 flex flex-col items-start gap-2 border-t border-[var(--pf-border-default)] pt-3">
                    <ul className="flex flex-col gap-1 text-sm">
                      {rowIssues.map((issue) => (
                        <li key={issue}>
                          <span className="text-[var(--pf-text-muted)]">{t('list.actionRequired')}: </span>
                          <span className="font-medium text-[var(--pf-status-warning-fg)]">
                            {t(`attention.required.${issue}`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {rowAttention && rowAttention !== 'classification' ? (
                      <Button asChild variant="secondary" size="sm">
                        <Link href={actionHref}>{t('attention.rowAction')}</Link>
                      </Button>
                    ) : null}
                    {needsCategory ? (
                      <Button asChild size="sm">
                        <Link href={categoryHref}>{t('attention.chooseCategory')}</Link>
                      </Button>
                    ) : null}
                  </div>
                ) : needsCategory ? (
                  <div className="mt-3">
                    <Button asChild size="sm">
                      <Link href={categoryHref}>{t('attention.chooseCategory')}</Link>
                    </Button>
                  </div>
                ) : null}
              </MainAppCompactListCard>
              );
            }}
          />

          {pageCount > 1 ? (
            <Pagination
              page={currentPage}
              pageCount={pageCount}
              onPageChange={goToPage}
              previousLabel={tCommon('actions.previous')}
              nextLabel={tCommon('actions.next')}
              statusLabel={t('list.pageStatus', { page: currentPage, pageCount })}
            />
          ) : null}
        </>
      )}
      </AdaptiveListBody>
    </div>
  );
}

function hasActiveFilters(filters: ExpensesOrgListViewProps['initialFilters']): boolean {
  return countExpenseListActiveFilters(filters) > 0;
}

function countExpenseListActiveFilters(filters: ExpensesOrgListViewProps['initialFilters']): number {
  let count = 0;
  if (filters.q?.trim()) count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  if (filters.projectId) count += 1;
  if (filters.costFamily) count += 1;
  if (filters.costCategoryId) count += 1;
  if (expenseListStatusFilterIsActive(filters.statusFilter ?? EXPENSE_LIST_STATUS_ALL)) count += 1;
  if (filters.cash) count += 1;
  if (filters.cashSource) count += 1;
  return count;
}

function buildExpenseListActiveSummary(
  filters: ExpensesOrgListViewProps['initialFilters'],
  ctx: {
    projects: ProjectOption[];
    categories: CostCategoryRow[];
    t: (key: string) => string;
    tStatus: (key: string) => string;
  },
): string[] {
  const chips: string[] = [];
  const trimmedQ = filters.q?.trim();
  if (trimmedQ) chips.push(trimmedQ);
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ?? '…';
    const to = filters.dateTo ?? '…';
    chips.push(`${from} – ${to}`);
  }
  if (filters.dateBasis === 'payment' && (filters.dateFrom || filters.dateTo)) {
    chips.push(ctx.t('filters.dateBasisPayment'));
  }
  if (filters.projectId) {
    const project = ctx.projects.find((row) => row.id === filters.projectId);
    chips.push(project?.name ?? ctx.t('filters.project'));
  }
  if (filters.costFamily) chips.push(ctx.t(`costFamilies.${filters.costFamily}`));
  if (filters.costCategoryId) {
    const category = ctx.categories.find((row) => row.id === filters.costCategoryId);
    chips.push(
      category ? displayCostCategoryName(category, (key) => ctx.t(key)) : ctx.t('filters.category'),
    );
  }
  const statusFilter = filters.statusFilter ?? EXPENSE_LIST_STATUS_ALL;
  if (expenseListStatusFilterIsActive(statusFilter)) {
    if (statusFilter === 'finalized' || statusFilter === 'void') {
      chips.push(ctx.tStatus(`expense.${statusFilter}`));
    } else {
      chips.push(ctx.t(`attention.options.${statusFilter}`));
    }
  }
  if (filters.cash) {
    chips.push(filters.cash === 'open' ? ctx.t('filters.cashOpen') : ctx.t('filters.cashPaid'));
  }
  if (filters.cashSource) {
    chips.push(
      filters.cashSource === 'suppliers'
        ? ctx.t('filters.cashSourceSuppliers')
        : ctx.t('filters.cashSourceSubcontractors'),
    );
  }
  return chips;
}
