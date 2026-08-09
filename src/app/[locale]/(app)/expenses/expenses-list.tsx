'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Receipt } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link, useRouter } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import type {
  CostCategoryRow,
  CostFamily,
  ExpenseStatus,
  ExpenseSummary,
  ProjectOption,
} from '@/modules/expenses/domain/types';
import { statusShape } from '@/modules/expenses/domain/lifecycle';

const ALL = '__all__';

export interface ExpensesListProps {
  readonly items: ExpenseSummary[];
  readonly total: number;
  readonly projects: ProjectOption[];
  readonly categories: CostCategoryRow[];
  readonly locale: string;
  readonly initialFilters: {
    dateFrom?: string;
    dateTo?: string;
    projectId?: string;
    costFamily?: CostFamily;
    costCategoryId?: string;
    status?: ExpenseStatus;
  };
}

export function ExpensesList({
  items,
  total,
  projects,
  categories,
  locale,
  initialFilters,
}: ExpensesListProps) {
  const t = useTranslations('expenses');
  const tStatus = useTranslations('status');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [dateFrom, setDateFrom] = React.useState(initialFilters.dateFrom ?? '');
  const [dateTo, setDateTo] = React.useState(initialFilters.dateTo ?? '');
  const [projectId, setProjectId] = React.useState(initialFilters.projectId ?? ALL);
  const [costFamily, setCostFamily] = React.useState(initialFilters.costFamily ?? ALL);
  const [costCategoryId, setCostCategoryId] = React.useState(initialFilters.costCategoryId ?? ALL);
  const [status, setStatus] = React.useState(initialFilters.status ?? ALL);

  function applyFilters() {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (projectId !== ALL) params.set('projectId', projectId);
    if (costFamily !== ALL) params.set('costFamily', costFamily);
    if (costCategoryId !== ALL) params.set('costCategoryId', costCategoryId);
    if (status !== ALL) params.set('status', status);
    router.push(`/expenses?${params.toString()}`);
  }

  function clearFilters() {
    setDateFrom('');
    setDateTo('');
    setProjectId(ALL);
    setCostFamily(ALL);
    setCostCategoryId(ALL);
    setStatus(ALL);
    router.push('/expenses');
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
      <div className="grid min-w-0 gap-3 rounded-lg border border-[var(--pf-border-default)] p-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label={t('filters.dateFrom')}
          className="min-w-0"
          dir="ltr"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          aria-label={t('filters.dateTo')}
          className="min-w-0"
          dir="ltr"
        />

        <Field label={t('filters.project')}>
          {(control) => (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('filters.project')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.allProjects')}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Select value={costFamily} onValueChange={setCostFamily}>
          <SelectTrigger aria-label={t('filters.family')}>
            <SelectValue placeholder={t('filters.family')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.allFamilies')}</SelectItem>
            {(['direct_project', 'shared', 'business_overhead', 'asset_capital'] as const).map((family) => (
              <SelectItem key={family} value={family}>
                {t(`costFamilies.${family}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Field label={t('filters.category')}>
          {(control) => (
            <Select value={costCategoryId} onValueChange={setCostCategoryId}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('filters.category')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.allCategories')}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.isSystem ? t(`costCategories.${category.key}`) : category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={t('filters.status')}>
          {(control) => (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue placeholder={t('filters.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('filters.allStatuses')}</SelectItem>
                {(['draft', 'finalized', 'void'] as const).map((value) => (
                  <SelectItem key={value} value={value}>
                    {tStatus(`expense.${value}`)}
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
                      <TableHead>{t('fields.description')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('fields.project')}</TableHead>
                      <TableHead className="hidden lg:table-cell">{t('fields.costFamily')}</TableHead>
                      <TableHead numeric>{t('fields.amount')}</TableHead>
                      <TableHead>{t('fields.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <Link href={`/expenses/${expense.id}`} className="font-medium hover:underline">
                            <span dir="ltr">
                              {formatBusinessDate(expense.expenseDate, locale, 'short')}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-start">
                          {expense.description || expense.supplierName || t('list.noDescription')}
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
                          <StatusBadge
                            shape={statusShape(expense.status)}
                            label={tStatus(`expense.${expense.status}`)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(expense) => (
              <Link
                href={`/expenses/${expense.id}`}
                className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                    {formatBusinessDate(expense.expenseDate, locale, 'short')}
                  </span>
                  <StatusBadge
                    className="shrink-0"
                    shape={statusShape(expense.status)}
                    label={tStatus(`expense.${expense.status}`)}
                  />
                </div>
                <p className="mt-1 truncate text-start text-sm text-[var(--pf-text-secondary)]">
                  {expense.description || expense.supplierName || t('list.noDescription')}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-[var(--pf-text-secondary)]">
                    {expense.projectName ?? t('targeting.overhead')}
                  </span>
                  <MoneyText value={expense.grossAmount} />
                </div>
              </Link>
            )}
          />

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
      filters.status,
  );
}
