import { Plus, Receipt } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getOverheadHome,
  type CostCategoryRow,
  type ExpenseSummary,
  type OverheadAllocationRunSummary,
} from '@/modules/expenses';
import { statusShape as expenseStatusShape } from '@/modules/expenses/domain/lifecycle';
import type { AllocationMethod } from '@/modules/expenses/domain/types';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('overheadHome.title') };
}

const RUN_STATUS_LABEL: Record<OverheadAllocationRunSummary['status'], string> = {
  draft: 'overheadHome.runs.statusDraft',
  applied: 'overheadHome.runs.statusApplied',
  superseded: 'overheadHome.runs.statusSuperseded',
};

function runStatusShape(status: OverheadAllocationRunSummary['status']): StatusShape {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'applied':
      return 'completed';
    default:
      return 'archived';
  }
}

function allocationMethodKey(method: AllocationMethod): string {
  if (method === 'manual_amount') return 'amount';
  if (method === 'manual_percent') return 'percent';
  return method;
}

export default async function OverheadHomePage() {
  const [t, tStatus, locale] = await Promise.all([
    getTranslations('expenses'),
    getTranslations('status'),
    getLocale(),
  ]);

  const data = await withOrgContext((context) => getOverheadHome(context));

  if (!data.allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('overheadHome.title')} description={t('overheadHome.description')} />
        <EmptyState
          icon={Receipt}
          title={t('overheadHome.notAllowed.title')}
          description={t('overheadHome.notAllowed.body')}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title={t('overheadHome.title')}
        description={t('overheadHome.description')}
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            {data.canManageCategories ? (
              <Button asChild variant="secondary">
                <Link href="/settings/cost-categories">{t('overheadHome.actions.costCategories')}</Link>
              </Button>
            ) : null}
            {data.canCreate ? (
              <Button asChild>
                <Link href="/expenses/new">
                  <Plus aria-hidden />
                  {t('overheadHome.actions.addOverhead')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <ExpenseFamilySection
        title={t('overheadHome.sections.overhead')}
        viewAllHref="/expenses?costFamily=business_overhead"
        viewAllLabel={t('overheadHome.actions.viewOverheadExpenses')}
        emptyTitle={t('overheadHome.empty.overheadTitle')}
        emptyBody={t('overheadHome.empty.overheadBody')}
        items={data.overheadExpenses}
        total={data.overheadTotal}
        locale={locale}
        t={t}
        tStatus={tStatus}
        createHref={data.canCreate ? '/expenses/new' : undefined}
        createLabel={t('overheadHome.actions.addOverhead')}
      />

      <ExpenseFamilySection
        title={t('overheadHome.sections.shared')}
        viewAllHref="/expenses?costFamily=shared"
        viewAllLabel={t('overheadHome.actions.viewSharedExpenses')}
        emptyTitle={t('overheadHome.empty.sharedTitle')}
        emptyBody={t('overheadHome.empty.sharedBody')}
        items={data.sharedExpenses}
        total={data.sharedTotal}
        locale={locale}
        t={t}
        tStatus={tStatus}
      />

      <AllocationRunsSection runs={data.allocationRuns} locale={locale} t={t} />

      <CategoriesSection
        overhead={data.overheadCategories}
        shared={data.sharedCategories}
        t={t}
        canManage={data.canManageCategories}
      />
    </div>
  );
}

function ExpenseFamilySection({
  title,
  viewAllHref,
  viewAllLabel,
  emptyTitle,
  emptyBody,
  items,
  total,
  locale,
  t,
  tStatus,
  createHref,
  createLabel,
}: {
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  emptyTitle: string;
  emptyBody: string;
  items: readonly ExpenseSummary[];
  total: number;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  tStatus: Awaited<ReturnType<typeof getTranslations>>;
  createHref?: string;
  createLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        <Link href={viewAllHref} className={textNavLinkMutedClassName}>
          {viewAllLabel}
        </Link>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={emptyTitle}
          description={emptyBody}
          action={
            createHref && createLabel ? (
              <Button asChild>
                <Link href={createHref}>
                  <Plus aria-hidden />
                  {createLabel}
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ResponsiveTable
            items={[...items]}
            getRowKey={(item) => item.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.date')}</TableHead>
                      <TableHead>{t('fields.description')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('fields.costFamily')}</TableHead>
                      <TableHead numeric>{t('fields.amount')}</TableHead>
                      <TableHead>{t('fields.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>
                          <Link href={`/expenses/${expense.id}`} className={cn(textNavLinkClassName, 'font-medium')}>
                            <span dir="ltr">{formatBusinessDate(expense.expenseDate, locale, 'short')}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-start">
                          {expense.description || expense.supplierName || t('list.noDescription')}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {t(`costFamilies.${expense.costFamily}`)}
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={expense.grossAmount} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            shape={expenseStatusShape(expense.status)}
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
              <Link href={`/expenses/${expense.id}`} className={cn(pressableCardLinkClassName, 'text-start')}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                    {formatBusinessDate(expense.expenseDate, locale, 'short')}
                  </span>
                  <StatusBadge
                    className="shrink-0"
                    shape={expenseStatusShape(expense.status)}
                    label={tStatus(`expense.${expense.status}`)}
                  />
                </div>
                <p className="mt-1 truncate text-start text-sm text-[var(--pf-text-secondary)]">
                  {expense.description || expense.supplierName || t('list.noDescription')}
                </p>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-[var(--pf-text-secondary)]">{t(`costFamilies.${expense.costFamily}`)}</span>
                  <MoneyText value={expense.grossAmount} />
                </div>
              </Link>
            )}
          />
          <p className="text-xs text-[var(--pf-text-muted)]">
            {t('overheadHome.showing', { count: items.length, total })}
          </p>
        </>
      )}
    </section>
  );
}

function AllocationRunsSection({
  runs,
  locale,
  t,
}: {
  runs: readonly OverheadAllocationRunSummary[];
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('overheadHome.sections.runs')}</h2>
      {runs.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('overheadHome.empty.runsTitle')}
          description={t('overheadHome.empty.runsBody')}
        />
      ) : (
        <ResponsiveTable
          items={[...runs]}
          getRowKey={(run) => run.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('overheadHome.runs.expense')}</TableHead>
                    <TableHead>{t('overheadHome.runs.period')}</TableHead>
                    <TableHead>{t('overheadHome.runs.method')}</TableHead>
                    <TableHead>{t('overheadHome.runs.status')}</TableHead>
                    <TableHead numeric>{t('overheadHome.runs.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <Link href={`/expenses/${run.expenseId}`} className={cn(textNavLinkClassName, 'font-medium')}>
                          {run.expenseDescription || t('list.noDescription')}
                        </Link>
                        <p className="text-xs text-[var(--pf-text-secondary)]">
                          {t(`costFamilies.${run.costFamily}`)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {formatBusinessDate(run.periodStart, locale, 'short')} –{' '}
                          {formatBusinessDate(run.periodEnd, locale, 'short')}
                        </span>
                      </TableCell>
                      <TableCell>{t(`allocation.methods.${allocationMethodKey(run.method)}`)}</TableCell>
                      <TableCell>
                        <StatusBadge shape={runStatusShape(run.status)} label={t(RUN_STATUS_LABEL[run.status])} />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={run.allocatableNetAmount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(run) => (
            <Link href={`/expenses/${run.expenseId}`} className={cn(pressableCardLinkClassName, 'text-start')}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 font-semibold">
                  {run.expenseDescription || t('list.noDescription')}
                </span>
                <StatusBadge
                  className="shrink-0"
                  shape={runStatusShape(run.status)}
                  label={t(RUN_STATUS_LABEL[run.status])}
                />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`allocation.methods.${allocationMethodKey(run.method)}`)}
                {' · '}
                <span dir="ltr">
                  {formatBusinessDate(run.periodStart, locale, 'short')} –{' '}
                  {formatBusinessDate(run.periodEnd, locale, 'short')}
                </span>
              </p>
              <div className="mt-2 flex justify-end">
                <MoneyText value={run.allocatableNetAmount} />
              </div>
            </Link>
          )}
        />
      )}
    </section>
  );
}

function CategoriesSection({
  overhead,
  shared,
  t,
  canManage,
}: {
  overhead: readonly CostCategoryRow[];
  shared: readonly CostCategoryRow[];
  t: Awaited<ReturnType<typeof getTranslations>>;
  canManage: boolean;
}) {
  const groups = [
    { family: 'business_overhead' as const, items: overhead },
    { family: 'shared' as const, items: shared },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">{t('overheadHome.sections.categories')}</h2>
        {canManage ? (
          <Link href="/settings/cost-categories" className={textNavLinkMutedClassName}>
            {t('overheadHome.actions.costCategories')}
          </Link>
        ) : null}
      </div>
      {overhead.length === 0 && shared.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('overheadHome.empty.categoriesTitle')}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.family} className="rounded-lg border border-[var(--pf-border-default)] p-4">
              <h3 className="text-sm font-medium">{t(`costFamilies.${group.family}`)}</h3>
              {group.items.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
                  {t('overheadHome.empty.categoriesTitle')}
                </p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {group.items.map((category) => (
                    <li key={category.id}>
                      {category.isSystem ? t(`costCategories.${category.key}`) : category.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
