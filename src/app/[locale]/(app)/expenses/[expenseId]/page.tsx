import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getExpense,
  listCostCategoriesForOrg,
  listProjectsForOrg,
  listWorkPackagesForOrg,
} from '@/modules/expenses';
import { statusShape } from '@/modules/expenses/domain/lifecycle';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { ExpenseDetailActions } from './expense-detail-actions';
import { ExpenseEditForm } from './expense-edit-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; expenseId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('detail.title') };
}

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;
  const t = await getTranslations('expenses');
  const tStatus = await getTranslations('status');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    try {
      const expense = await getExpense(context, expenseId);
      const [projects, categories] = await Promise.all([
        listProjectsForOrg(context),
        listCostCategoriesForOrg(context),
      ]);
      const workPackages = expense.projectId
        ? await listWorkPackagesForOrg(context, expense.projectId)
        : [];
      return { expense, projects, categories, workPackages };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { expense, projects, categories, workPackages } = data;
  const recurrence = decodeRecurrenceRule(expense.recurrenceRule);
  const readOnly = expense.status !== 'draft';
  const canFinalize = expense.status === 'draft';
  const canVoid = expense.status === 'finalized' && !expense.voidsExpenseId;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        title={t('detail.title')}
        description={formatBusinessDate(expense.expenseDate, locale)}
        actions={
          <Link href="/expenses" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {tCommon('actions.back')}
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge shape={statusShape(expense.status)} label={tStatus(`expense.${expense.status}`)} />
        <MoneyText value={expense.grossAmount} className="text-xl font-semibold" />
        <ExpenseDetailActions
          expenseId={expense.id}
          status={expense.status}
          canFinalize={canFinalize}
          canVoid={canVoid}
          amount={expense.grossAmount}
          expenseDate={expense.expenseDate}
        />
      </div>

      {readOnly ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <DetailRow label={t('fields.description')} value={expense.description} />
            <DetailRow label={t('fields.supplier')} value={expense.supplierName} />
            <DetailRow
              label={t('fields.project')}
              value={expense.projectName ?? t('targeting.overhead')}
            />
            <DetailRow label={t('fields.costFamily')} value={t(`costFamilies.${expense.costFamily}`)} />
            {expense.recurrenceRule ? (
              <DetailRow
                label={t('fields.recurrence')}
                value={
                  recurrence.cadence === 'custom'
                    ? recurrence.customLabel
                    : t(`recurrence.${recurrence.cadence}`)
                }
              />
            ) : null}
            {expense.notes ? <DetailRow label={t('fields.notes')} value={expense.notes} /> : null}
            {expense.voidsExpenseId ? (
              <p className="text-[var(--pf-text-muted)]">{t('detail.reversalOf', { id: expense.voidsExpenseId })}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <ExpenseEditForm
          expense={expense}
          projects={projects}
          categories={categories}
          workPackages={workPackages}
        />
      )}

      {expense.allocations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('allocation.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {expense.allocations.map((line, index) => (
              <div key={index} className="flex items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 last:border-0">
                <span>
                  {line.targetType === 'overhead'
                    ? t('targeting.overhead')
                    : projects.find((project) => project.id === line.projectId)?.name}
                  {line.method === 'manual_percent' && line.percent ? ` (${line.percent}%)` : null}
                </span>
                <MoneyText value={line.amount} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-[var(--pf-text-muted)]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
