import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listInventoryItemsForOrg } from '@/modules/assets';
import {
  getExpense,
  getExpenseCorrectionChain,
  listCostCategoriesForOrg,
  listProjectsForOrg,
  listWorkPackagesForOrg,
} from '@/modules/expenses';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { listVendorsForOrg } from '@/modules/vendors';
import { statusShape } from '@/modules/expenses/domain/lifecycle';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isMonthClosed, yearMonthFromBusinessDate } from '@/modules/month-close';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { ExpenseCorrectionHistory } from './expense-correction-history';
import { ExpenseDetailActions } from './expense-detail-actions';
import { ExpenseEditForm } from './expense-edit-form';
import { PromoteVendorPanel } from './promote-vendor-panel';
import { ExpenseDetailAttentionFocus } from '@/modules/expenses/ui/expense-detail-attention-focus';
import { ExpenseDetailAttentionPanel } from '@/modules/expenses/ui/expense-detail-attention-panel';
import { resolveExpenseDetailAttention } from '@/modules/expenses/domain/expense-attention';
import { resolveExpenseBackNavigation } from '@/modules/expenses/domain/expense-return-navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

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
  searchParams,
}: {
  params: Promise<{ expenseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { expenseId } = await params;
  const rawSearchParams = await searchParams;
  const rawReturnTo =
    typeof rawSearchParams.returnTo === 'string' ? rawSearchParams.returnTo : undefined;
  const backNavigation = resolveExpenseBackNavigation(rawReturnTo);
  const t = await getTranslations('expenses');
  const tStatus = await getTranslations('status');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    try {
      const expense = await getExpense(context, expenseId);
      const [projects, categories, documentsPanel, customFields, correctionChain, tax] =
        await Promise.all([
          listProjectsForOrg(context),
          listCostCategoriesForOrg(context),
          getEntityDocumentPanelData(context, 'expense', expenseId),
          listCustomFieldValuesForEntity(context, 'expense', expenseId).catch(() => []),
          getExpenseCorrectionChain(context, expenseId).catch(() => null),
          resolveApplicableDefaultTax(
            context,
            expense.expenseDate ?? todayInTimeZone(context.organization.timezone),
          ),
        ]);
      const workPackages = expense.projectId
        ? await listWorkPackagesForOrg(context, expense.projectId)
        : [];
      const vendors = hasPermission(context, PERMISSIONS.VENDORS_READ)
        ? await listVendorsForOrg(context, { status: 'active' }).catch(() => [])
        : [];
      const inventoryItems = hasPermission(context, PERMISSIONS.ASSETS_MANAGE)
        ? await listInventoryItemsForOrg(context).catch(() => [])
        : [];
      return {
        expense,
        projects,
        categories,
        workPackages,
        vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        inventoryItems: inventoryItems.map((item) => ({ id: item.id, name: item.name, unit: item.unit })),
        documentsPanel,
        customFields,
        correctionChain,
        taxRatePercent: tax.resolved?.ratePercent ?? null,
        canPromoteVendor: hasPermission(context, PERMISSIONS.VENDORS_MANAGE),
        canFinalizeExpense: hasPermission(context, PERMISSIONS.EXPENSES_FINALIZE),
        canCreateExpense: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
        canUpdateExpense: hasPermission(context, PERMISSIONS.EXPENSES_UPDATE),
        monthOpen:
          expense.status === 'finalized'
            ? !(await isMonthClosed(
                context,
                yearMonthFromBusinessDate(expense.expenseDate),
              ))
            : true,
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const {
    expense,
    projects,
    categories,
    workPackages,
    vendors,
    inventoryItems,
    documentsPanel,
    customFields,
    correctionChain,
    taxRatePercent,
    canPromoteVendor,
    canFinalizeExpense,
    canCreateExpense,
    canUpdateExpense,
    monthOpen,
  } = data;
  const recurrence = decodeRecurrenceRule(expense.recurrenceRule);
  const canEditFinalized =
    expense.status === 'finalized' &&
    !expense.voidsExpenseId &&
    !expense.adjustsExpenseId &&
    monthOpen &&
    canUpdateExpense;
  const readOnly = expense.status !== 'draft' && !canEditFinalized;
  const canFinalize =
    expense.status === 'draft' && canFinalizeExpense && Boolean(expense.costCategoryId);
  const canVoid = expense.status === 'finalized' && !expense.voidsExpenseId && canFinalizeExpense;
  const canReverse =
    expense.status === 'finalized' &&
    !expense.voidsExpenseId &&
    !expense.adjustsExpenseId &&
    canFinalizeExpense;
  const canCorrect =
    expense.status === 'finalized' &&
    !expense.voidsExpenseId &&
    canFinalizeExpense &&
    canCreateExpense;
  const showPromoteVendor =
    canPromoteVendor && Boolean(expense.supplierName?.trim()) && !expense.vendorId;

  const hasActiveReversal =
    correctionChain != null &&
    expense.id === correctionChain.originalExpenseId &&
    correctionChain.entries.some(
      (entry) => entry.role === 'reversal' && entry.status === 'finalized',
    );
  const detailAttention = resolveExpenseDetailAttention(expense, { hasActiveReversal });

  return (
    <div className="mx-auto flex min-w-0 w-full max-w-2xl flex-col gap-6">
      <Suspense fallback={null}>
        <ExpenseDetailAttentionFocus attention={detailAttention} />
      </Suspense>
      <PageHeader
        title={t('detail.title')}
        description={formatBusinessDate(expense.expenseDate, locale)}
        breadcrumb={
          <ContextualBackLink href={backNavigation.href}>
            {t(`backNavigation.${backNavigation.labelKey}`)}
          </ContextualBackLink>
        }
      />

      {detailAttention ? <ExpenseDetailAttentionPanel attention={detailAttention} /> : null}

      {detailAttention === 'project_allocation' && readOnly && expense.allocations.length === 0 ? (
        <div id="expense-allocation" className="scroll-mt-24" aria-hidden />
      ) : null}

      {expense.status === 'draft' && !detailAttention ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm text-[var(--pf-text-primary)]"
        >
          {t('detail.draftBanner')}
        </div>
      ) : null}

      {expense.status === 'finalized' ? (
        <div
          role="status"
          className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm text-[var(--pf-text-primary)]"
        >
          {canEditFinalized ? t('detail.finalizedEditableBanner') : t('detail.finalizedBanner')}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge shape={statusShape(expense.status)} label={tStatus(`expense.${expense.status}`)} />
        <MoneyText value={expense.grossAmount} className="text-xl font-semibold" />
        <ExpenseDetailActions
          section="primary"
          expenseId={expense.id}
          status={expense.status}
          canFinalize={canFinalize}
          canVoid={canVoid}
          canReverse={canReverse}
          canCorrect={canCorrect}
          expense={expense}
          projects={projects}
          categories={categories}
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
            {expense.vendorId ? (
              <div className="grid gap-0.5">
                <span className="text-xs text-[var(--pf-text-muted)]">{t('fields.linkedVendor')}</span>
                <Link href={`/vendors/${expense.vendorId}`} className={textNavLinkClassName}>
                  {t('detail.viewVendor')}
                </Link>
              </div>
            ) : null}
            <DetailRow
              label={t('fields.project')}
              value={expense.projectName ?? t('targeting.overhead')}
            />
            <div className="grid gap-2 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 sm:grid-cols-3">
              <div>
                <span className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewNet')}</span>
                <div>
                  <MoneyText value={expense.netAmount} className="font-medium" />
                </div>
              </div>
              <div>
                <span className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewTax')}</span>
                <div>
                  {expense.taxAmount ? (
                    <MoneyText value={expense.taxAmount} className="font-medium" />
                  ) : (
                    <span className="text-[var(--pf-text-muted)]">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs text-[var(--pf-text-muted)]">{t('fields.previewGross')}</span>
                <div>
                  <MoneyText value={expense.grossAmount} className="font-medium" />
                </div>
              </div>
              <p className="text-xs text-[var(--pf-text-muted)] sm:col-span-3">
                {t('fields.previewActualHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ExpenseEditForm
          expense={expense}
          projects={projects}
          categories={categories}
          workPackages={workPackages}
          vendors={vendors}
          inventoryItems={inventoryItems}
          taxRatePercent={taxRatePercent}
        />
      )}

      {canReverse || canCorrect || correctionChain?.hasLinks || expense.voidsExpenseId || expense.adjustsExpenseId || expense.notes || expense.recurrenceRule || showPromoteVendor ? (
        <details className="rounded-lg border border-[var(--pf-border-default)]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t('historyAdvanced')}</summary>
          <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] px-4 py-4">
            <ExpenseDetailActions
              section="advanced"
              expenseId={expense.id}
              status={expense.status}
              canFinalize={canFinalize}
              canVoid={canVoid}
              canReverse={canReverse}
              canCorrect={canCorrect}
              expense={expense}
              projects={projects}
              categories={categories}
              amount={expense.grossAmount}
              expenseDate={expense.expenseDate}
            />

            {correctionChain ? (
              <ExpenseCorrectionHistory
                chain={correctionChain}
                currentExpenseId={expense.id}
                returnTo={backNavigation.safeReturnTo}
              />
            ) : null}

            <div className="grid gap-3 text-sm">
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
                <p className="text-[var(--pf-text-muted)]">
                  {t('detail.reversalOf', { id: expense.voidsExpenseId })}
                </p>
              ) : null}
              {expense.adjustsExpenseId ? (
                <p className="text-[var(--pf-text-muted)]">
                  {t('detail.adjustmentOf', { id: expense.adjustsExpenseId })}
                </p>
              ) : null}
            </div>

            {showPromoteVendor && expense.supplierName ? (
              <PromoteVendorPanel expenseId={expense.id} supplierName={expense.supplierName} />
            ) : null}
          </div>
        </details>
      ) : null}

      {expense.allocations.length > 0 ? (
        <Card
          className="min-w-0 scroll-mt-24"
          id={
            detailAttention === 'project_allocation' && readOnly ? 'expense-allocation' : undefined
          }
        >
          <CardHeader>
            <CardTitle className="text-start">{t('allocation.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3 text-sm">
            <dl className="grid gap-2 text-xs text-[var(--pf-text-secondary)] sm:grid-cols-3">
              {expense.recurrenceRule ? (
                <div>
                  <dt className="text-[var(--pf-text-muted)]">{t('lifecycle.allocationPeriod')}</dt>
                  <dd>
                    {recurrence.cadence === 'custom'
                      ? recurrence.customLabel
                      : t(`recurrence.${recurrence.cadence}`)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[var(--pf-text-muted)]">{t('lifecycle.allocationMethodSummary')}</dt>
                <dd>
                  {[
                    ...new Set(
                      expense.allocations.map((line) => {
                        if (line.method === 'manual_percent') return t('allocation.methods.percent');
                        if (line.method === 'manual_amount') return t('allocation.methods.amount');
                        return t(`allocation.methods.${line.method}`);
                      }),
                    ),
                  ].join(', ')}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[var(--pf-text-muted)]">{t('lifecycle.allocationProjects')}</dt>
                <dd className="break-words">
                  {expense.allocations
                    .filter((line) => line.targetType === 'project')
                    .map(
                      (line) =>
                        projects.find((project) => project.id === line.projectId)?.name ??
                        line.projectId,
                    )
                    .filter(Boolean)
                    .join(', ') || t('targeting.overhead')}
                </dd>
              </div>
            </dl>
            {expense.allocations.map((line, index) => (
              <div
                key={index}
                className="flex min-w-0 items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 text-start last:border-0"
              >
                <span className="min-w-0 truncate">
                  {line.targetType === 'overhead'
                    ? t('targeting.overhead')
                    : projects.find((project) => project.id === line.projectId)?.name}
                  {' · '}
                  {line.method === 'manual_percent'
                    ? t('allocation.methods.percent')
                    : line.method === 'manual_amount'
                      ? t('allocation.methods.amount')
                      : t(`allocation.methods.${line.method}`)}
                  {line.method === 'manual_percent' && line.percent ? ` (${line.percent}%)` : null}
                </span>
                <MoneyText value={line.amount} className="shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <EntityCustomFieldsPanel
        entityId={expense.id}
        fields={customFields}
        revalidatePath={`/expenses/${expense.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <DocumentAttachments
        ownerType="expense"
        ownerId={expense.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="grid min-w-0 gap-0.5 text-start">
      <span className="text-xs text-[var(--pf-text-muted)]">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}
