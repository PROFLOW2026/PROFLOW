'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Receipt } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { StatusBadge } from '@/components/ui/status-badge';
import { Field } from '@/components/ui/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { Button } from '@/components/ui/button';
import { Input as _Input } from '@/components/ui/input';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
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
  expenseAttentionActionHref,
  expenseListShowsAttentionColumns,
  pickAttentionFilterFromItems,
  resolveExpenseAttentionRequired,
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
  buildExpenseDetailHref,
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

export interface ExpensesListProps {
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
    projectId?: string;
    costFamily?: CostFamily;
    costCategoryId?: string;
    statusFilter?: ExpenseListStatusFilter;
  };
  /** Server-supplied today for timezone-accurate presets in DateRangeSelector. */
  today?: string;
}

export function ExpensesList({
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
}: ExpensesListProps) {
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
  const [projectId, setProjectId] = React.useState(initialFilters.projectId ?? EXPENSE_LIST_STATUS_ALL);
  const [costFamily, setCostFamily] = React.useState(initialFilters.costFamily ?? EXPENSE_LIST_STATUS_ALL);
  const [costCategoryId, setCostCategoryId] = React.useState(
    initialFilters.costCategoryId ?? EXPENSE_LIST_STATUS_ALL,
  );
  const [statusFilter, setStatusFilter] = React.useState<ExpenseListStatusFilter>(
    initialFilters.statusFilter ?? EXPENSE_LIST_STATUS_ALL,
  );

  const activeAttention = isExpenseListAttentionStatusFilter(statusFilter)
    ? statusFilter
    : undefined;
  const showAttentionColumns = expenseListShowsAttentionColumns(activeAttention);

  function buildFilterParams(nextStatusFilter?: ExpenseListStatusFilter, page = 1) {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (projectId !== EXPENSE_LIST_STATUS_ALL) params.set('projectId', projectId);
    if (costFamily !== EXPENSE_LIST_STATUS_ALL) params.set('costFamily', costFamily);
    if (costCategoryId !== EXPENSE_LIST_STATUS_ALL) params.set('costCategoryId', costCategoryId);

    const filterValue = nextStatusFilter ?? statusFilter;
    if (filterValue !== EXPENSE_LIST_STATUS_ALL) {
      const statusParams = expenseListStatusFilterToSearchParams(filterValue);
      statusParams.forEach((value, key) => params.set(key, value));
    }
    if (page > 1) params.set('page', String(page));
    return params;
  }

  function applyFilters() {
    router.push(`/expenses?${buildFilterParams(undefined, 1).toString()}`);
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setProjectId(EXPENSE_LIST_STATUS_ALL);
    setCostFamily(EXPENSE_LIST_STATUS_ALL);
    setCostCategoryId(EXPENSE_LIST_STATUS_ALL);
    setStatusFilter(EXPENSE_LIST_STATUS_ALL);
    router.push('/expenses');
  }

  function goToPage(page: number) {
    router.push(`/expenses?${buildFilterParams(undefined, page).toString()}`);
  }

  function resolveRowAttention(expense: ExpenseSummary) {
    return resolveExpenseAttentionRequired(expense, {
      assumeProjectAllocation: activeAttention === 'project_allocation',
    });
  }

  function openAttentionFilterFromSummary() {
    const filter = pickAttentionFilterFromItems(items);
    if (!filter) return;
    setStatusFilter(filter);
    router.push(`/expenses?${buildFilterParams(filter, 1).toString()}`);
  }

  function clearAttentionFilter() {
    setStatusFilter(EXPENSE_LIST_STATUS_ALL);
    router.push(`/expenses?${buildFilterParams(EXPENSE_LIST_STATUS_ALL, 1).toString()}`);
  }

  if (items.length === 0 && !hasActiveFilters(initialFilters)) {
    return (
      <EmptyState
        icon={Receipt}
        title={t('list.empty.title')}
        description={t('list.empty.description')}
        action={
          <Button asChild>
            <Link href="/expenses/new">{t('list.empty.action')}</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Date range with presets — controlled by the parent's dateFrom/dateTo state */}
      <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
        <p className="mb-2 text-xs text-[var(--pf-text-muted)]">{t('filters.expenseDateHint')}</p>
        <DateRangeSelector
          today={today}
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
          fromName="dateFrom"
          toName="dateTo"
          labels={{
            from: t('filters.dateFrom'),
            to: t('filters.dateTo'),
          }}
        />
      </div>
      <div className="grid min-w-0 gap-3 rounded-lg border border-[var(--pf-border-default)] p-3 sm:grid-cols-2 lg:grid-cols-3">

        <Field label={t('filters.project')} className="min-w-0">
          {(control) => (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
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
          )}
        </Field>

        <Field label={t('filters.family')} className="min-w-0">
          {(control) => (
            <Select
              value={costFamily}
              onValueChange={(value) =>
                setCostFamily(value as CostFamily | typeof EXPENSE_LIST_STATUS_ALL)
              }
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
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
          )}
        </Field>

        <Field label={t('filters.category')} className="min-w-0">
          {(control) => (
            <Select value={costCategoryId} onValueChange={setCostCategoryId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
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
          )}
        </Field>

        <Field label={t('filters.status')} className="min-w-0" id="expenses-status-filter">
          {(control) => (
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as ExpenseListStatusFilter)}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
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
          )}
        </Field>

        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="button" onClick={applyFilters}>
            {tCommon('actions.filter')}
          </Button>
          <Button type="button" variant="ghost" onClick={clearFilters}>
            {tCommon('actions.clearFilters')}
          </Button>
        </div>
      </div>

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

      {items.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{tCommon('states.noResults')}</p>
      ) : (
        <>
          <ResponsiveTable
            items={items}
            getRowKey={(expense) => expense.id}
            desktop={
              <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
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
                      const rowAttention = resolveRowAttention(expense);
                      const actionHref = expenseAttentionActionHref(expense.id, rowAttention, {
                        returnTo: listReturnTo,
                      });
                      const rowHref = buildExpenseDetailHref(expense.id, { returnTo: listReturnTo });
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
                            {rowAttention && !showAttentionColumns ? (
                              <ExpenseAttentionIndicator attention={rowAttention} compact />
                            ) : null}
                          </div>
                        </TableCell>
                        {showAttentionColumns ? (
                          <>
                            <TableCell className="text-start">
                              {rowAttention ? (
                                <span className="text-sm font-medium text-[var(--pf-status-warning-fg)]">
                                  {t(`attention.required.${rowAttention}`)}
                                </span>
                              ) : (
                                <span className="text-[var(--pf-text-muted)]">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {rowAttention ? (
                                <Button asChild variant="secondary" size="sm">
                                  <Link href={actionHref}>{t('attention.rowAction')}</Link>
                                </Button>
                              ) : null}
                            </TableCell>
                          </>
                        ) : null}
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(expense) => {
              const rowAttention = resolveRowAttention(expense);
              const actionHref = expenseAttentionActionHref(expense.id, rowAttention, {
                returnTo: listReturnTo,
              });
              const rowHref = buildExpenseDetailHref(expense.id, { returnTo: listReturnTo });
              return (
              <div className={cn(pressableCardLinkClassName, 'text-start')}>
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
                    {rowAttention && !showAttentionColumns ? (
                      <ExpenseAttentionIndicator attention={rowAttention} compact />
                    ) : null}
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
                {rowAttention && showAttentionColumns ? (
                  <div className="mt-3 flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-3">
                    <p className="text-sm text-start">
                      <span className="text-[var(--pf-text-muted)]">{t('list.actionRequired')}: </span>
                      <span className="font-medium text-[var(--pf-status-warning-fg)]">
                        {t(`attention.required.${rowAttention}`)}
                      </span>
                    </p>
                    <Button asChild variant="secondary" size="sm" className="self-start">
                      <Link href={actionHref}>{t('attention.rowAction')}</Link>
                    </Button>
                  </div>
                ) : null}
              </div>
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

          <p className="text-xs text-[var(--pf-text-muted)]">
            {t('list.count', { count: items.length, total })}
          </p>
        </>
      )}
    </div>
  );
}

function hasActiveFilters(filters: ExpensesListProps['initialFilters']): boolean {
  return Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.projectId ||
      filters.costFamily ||
      filters.costCategoryId ||
      expenseListStatusFilterIsActive(filters.statusFilter ?? EXPENSE_LIST_STATUS_ALL),
  );
}
