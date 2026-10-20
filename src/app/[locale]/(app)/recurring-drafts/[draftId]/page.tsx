import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
  MainAppTableShell,
} from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { listCostCategoriesForOrg, findExpenseById } from '@/modules/expenses';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { formatMoneyString } from '@/shared/money/format';
import { isMonthClosed } from '@/modules/month-close';
import { hasExplicitRecurringCategory } from '@/modules/recurring-drafts/application/resolve-expense-category';
import {
  generatedEntityPath,
  getRecurringDraftDetail,
  canManageDraftKind,
} from '@/modules/recurring-drafts';
import { RecurringDraftActions } from '@/modules/recurring-drafts/ui/draft-actions';
import { PayloadPreview } from '@/modules/recurring-drafts/ui/payload-preview';
import { MissingMonthsBackfill } from '@/modules/recurring-drafts/ui/missing-months-backfill';
import { draftStatusShape } from '@/modules/recurring-drafts/ui/status-shape';
import {
  missingMonthRange,
  retroMonthRangeFromStart,
} from '@/modules/recurring-drafts/domain/missing-months';
import { formatSafeBusinessDate } from '@/modules/recurring-drafts/domain/safe-dates';
import { withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate } from '@/shared/dates/format';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import {
  endRecurringDraftAction,
  generateRecurringDraftAction,
  generateRecurringDraftHistoryFormAction,
  pauseRecurringDraftAction,
  resumeRecurringDraftAction,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recurringDrafts' });
  return { title: t('detail.title') };
}

export default async function RecurringDraftDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; draftId: string }>;
  searchParams: Promise<{ finalized?: string; closed?: string; missingCategory?: string }>;
}) {
  const { draftId } = await params;
  const query = await searchParams;
  const [t, locale, tExpenses] = await Promise.all([
    getTranslations('recurringDrafts'),
    getLocale(),
    getTranslations('expenses'),
  ]);

  const loaded = await withOrgContext(async (context) => {
    try {
      const detail = await getRecurringDraftDetail(context, draftId);
      const today = todayInTimeZone(context.organization.timezone);
      const displayStartDate =
        detail.runs.length > 0
          ? detail.runs.reduce(
              (earliest, run) => (run.runDate < earliest ? run.runDate : earliest),
              detail.runs[0]!.runDate,
            )
          : detail.draft.nextRunDate;
      const expectedRange = retroMonthRangeFromStart(
        displayStartDate,
        today,
        detail.draft.endDate,
      );
      const missing = expectedRange
        ? missingMonthRange(
            expectedRange.months,
            detail.runs.map((run) => run.occurrenceYearMonth),
          )
        : null;

      const categories =
        detail.draft.draftKind === 'expense'
          ? await listCostCategoriesForOrg(context).catch(() => [])
          : [];

      const runStatuses = await Promise.all(
        detail.runs.map(async (run) => {
          if (run.generatedEntityType !== 'expense' || !run.generatedEntityId) {
            return { runId: run.id, label: null as string | null };
          }
          const expense = await findExpenseById(
            context.db,
            context.organizationId,
            run.generatedEntityId,
          );
          if (!expense) return { runId: run.id, label: null as string | null };
          if (expense.status === 'finalized') {
            return { runId: run.id, label: t('occurrenceOutcome.finalized') };
          }
          if (detail.draft.autoFinalizeExpense && run.occurrenceYearMonth) {
            const closed = await isMonthClosed(context, run.occurrenceYearMonth);
            if (closed) {
              return { runId: run.id, label: t('occurrenceOutcome.blocked_closed') };
            }
          }
          if (expense.status === 'draft') {
            return { runId: run.id, label: t('occurrenceOutcome.draft') };
          }
          return { runId: run.id, label: null as string | null };
        }),
      );

      const missingCategory =
        detail.draft.draftKind === 'expense' &&
        detail.payload.kind === 'expense' &&
        !hasExplicitRecurringCategory(detail.payload.data);

      const costCategoryId =
        detail.payload.kind === 'expense' ? detail.payload.data.costCategoryId : null;
      const categoryRow = costCategoryId
        ? categories.find((category) => category.id === costCategoryId)
        : null;
      const categoryLabel = categoryRow
        ? displayCostCategoryName(categoryRow, (key) => tExpenses(key))
        : null;

      return {
        ...detail,
        canManage: canManageDraftKind(context, detail.draft.draftKind),
        missing,
        missingCategory,
        categoryLabel,
        runStatusById: Object.fromEntries(runStatuses.map((row) => [row.runId, row.label])),
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();

  const { draft, payload, runs, amountVersions, preview, canManage, missing, missingCategory, categoryLabel, runStatusById } = loaded;
  const isMonthlyExpense =
    draft.draftKind === 'expense' && draft.frequency === 'monthly';
  const displayStartDate =
    runs.length > 0
      ? runs.reduce(
          (earliest, run) => (run.runDate < earliest ? run.runDate : earliest),
          runs[0]!.runDate,
        )
      : draft.nextRunDate;

  const finalizedCount = Number(query.finalized ?? '0');
  const closedCount = Number(query.closed ?? '0');
  const missingCategoryCount = Number(query.missingCategory ?? '0');
  const retroBanner =
    finalizedCount > 0 && closedCount > 0
      ? t('historyResult.partial', { finalized: finalizedCount, closed: closedCount })
      : finalizedCount > 0
        ? t('historyResult.created', { count: finalizedCount })
        : missingCategoryCount > 0
          ? t('errors.categoryRequiredForActual')
          : null;

  return (
    <MainAppPage>
      {retroBanner ? <Alert tone="success">{retroBanner}</Alert> : null}
      {missingCategory && canManage ? (
        <Alert tone="warning">
          <p>{t('errors.categoryRequiredForActual')}</p>
          <Link href={`/recurring-drafts/${draft.id}/edit`} className={textNavLinkClassName}>
            {t('detail.edit')}
          </Link>
        </Alert>
      ) : null}
      <PageHeader
        title={draft.title}
        description={
          isMonthlyExpense ? t('detail.monthlyFixedExpense') : t('detail.title')
        }
        breadcrumb={
          <ContextualBackLink href="/recurring-drafts">
            {t('backToRecurringExpenses')}
          </ContextualBackLink>
        }
        meta={
          <StatusBadge shape={draftStatusShape(draft.status)} label={t(`status.${draft.status}`)} />
        }
        actions={
          canManage && draft.status !== 'ended' ? (
            <Button asChild variant="secondary" className="min-h-11">
              <Link href={`/recurring-drafts/${draft.id}/edit`}>{t('detail.editDefinition')}</Link>
            </Button>
          ) : null
        }
      />
      <MainAppSection
        title={isMonthlyExpense ? t('detail.monthlyFixedExpense') : t('detail.schedule')}
      >
        {isMonthlyExpense ? (
          <div className="mb-3 min-w-0">
            <PayloadPreview
              payload={payload}
              preview={preview}
              locale={locale}
              categoryLabel={categoryLabel}
            />
          </div>
        ) : null}
        <MainAppSummaryGrid>
          {!isMonthlyExpense ? (
            <>
              <MainAppSummaryItem label={t('fields.kind')}>{t(`kind.${draft.draftKind}`)}</MainAppSummaryItem>
              <MainAppSummaryItem label={t('fields.frequency')}>
                {t(`frequency.${draft.frequency}`)}
                {draft.intervalCount > 1
                  ? ` · ${t('detail.intervalLabel', { count: draft.intervalCount })}`
                  : ''}
              </MainAppSummaryItem>
            </>
          ) : (
            <MainAppSummaryItem label={t('fields.startDate')}>
              <span dir="ltr">{formatBusinessDate(displayStartDate, locale)}</span>
            </MainAppSummaryItem>
          )}
          <MainAppSummaryItem label={t('fields.nextRunDate')}>
            <span dir="ltr">{formatBusinessDate(draft.nextRunDate, locale)}</span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.endDate')}>
            <span dir="ltr">
              {draft.endDate ? formatBusinessDate(draft.endDate, locale) : t('fields.none')}
            </span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('detail.statusLabel')}>
            {t(`status.${draft.status}`)}
          </MainAppSummaryItem>
          {isMonthlyExpense && preview.expense ? (
            <MainAppSummaryItem label={t('fields.amount')}>
              {formatMoneyString(preview.expense.amount, preview.expense.currency, locale)}
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
        {draft.draftKind === 'expense' ? (
          <p className="mt-3 text-sm text-[var(--pf-text-secondary)]">
            {draft.autoFinalizeExpense
              ? t('detail.autoFinalizeSimple')
              : t('detail.draftOnlySimple')}
          </p>
        ) : null}
      </MainAppSection>

      {!isMonthlyExpense ? (
        <MainAppSection title={t('detail.payload')}>
          <PayloadPreview payload={payload} preview={preview} locale={locale} />
        </MainAppSection>
      ) : null}

      {amountVersions.length > 1 ? (
        <MainAppSection title={t('detail.amountHistory')}>
          <ResponsiveTable
            items={amountVersions}
            getRowKey={(version) => version.id}
            desktop={
              <MainAppTableShell>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.amount')}</TableHead>
                      <TableHead>{t('fields.validFrom')}</TableHead>
                      <TableHead>{t('fields.validTo')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...amountVersions].reverse().map((version) => (
                      <TableRow key={version.id}>
                        <TableCell>
                          {formatMoneyString(version.amount, version.currency, locale)}
                        </TableCell>
                        <TableCell dir="ltr">
                          {formatSafeBusinessDate(version.validFrom, locale, t('fields.none'))}
                        </TableCell>
                        <TableCell dir="ltr">
                          {version.validTo
                            ? formatSafeBusinessDate(version.validTo, locale, t('fields.none'))
                            : t('fields.openEnded')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MainAppTableShell>
            }
            renderMobileCard={(version) => (
              <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
                <p className="font-medium">
                  {formatMoneyString(version.amount, version.currency, locale)}
                </p>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                  {formatSafeBusinessDate(version.validFrom, locale, t('fields.none'))}
                  {' → '}
                  {version.validTo
                    ? formatSafeBusinessDate(version.validTo, locale, t('fields.none'))
                    : t('fields.openEnded')}
                </p>
              </div>
            )}
          />
        </MainAppSection>
      ) : null}

      {canManage ? (
        <MainAppSection>
        <RecurringDraftActions
          draftId={draft.id}
          status={draft.status}
          generateAction={generateRecurringDraftAction}
          pauseAction={pauseRecurringDraftAction}
          resumeAction={resumeRecurringDraftAction}
          endAction={endRecurringDraftAction}
        />
        </MainAppSection>
      ) : null}

      {canManage && isMonthlyExpense && draft.status === 'active' ? (
        <MainAppSection>
        <MissingMonthsBackfill
          draftId={draft.id}
          missingFromYearMonth={missing?.fromYearMonth ?? null}
          missingToYearMonth={missing?.toYearMonth ?? null}
          missingCount={missing?.count ?? 0}
          action={generateRecurringDraftHistoryFormAction}
        />
        </MainAppSection>
      ) : null}

      <MainAppSection
        title={isMonthlyExpense ? t('detail.generatedExpenses') : t('detail.history')}
      >
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noHistory')}</p>
        ) : (
          <ResponsiveTable
            items={runs}
            getRowKey={(run) => run.id}
            desktop={
              <MainAppTableShell>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('fields.runDate')}</TableHead>
                      <TableHead>{t('fields.occurrenceMonth')}</TableHead>
                      <TableHead>{t('detail.occurrenceStatus')}</TableHead>
                      <TableHead>{t('detail.openEntity')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell dir="ltr">{formatBusinessDate(run.runDate, locale)}</TableCell>
                        <TableCell dir="ltr">
                          {run.occurrenceYearMonth ?? t('fields.none')}
                          {isMonthlyExpense && preview.expense
                            ? ` · ${formatMoneyString(preview.expense.amount, preview.expense.currency, locale)}`
                            : ''}
                        </TableCell>
                        <TableCell>
                          {runStatusById[run.id] ?? t('fields.none')}
                        </TableCell>
                        <TableCell>
                          {run.generatedEntityId ? (
                            <Link
                              href={generatedEntityPath(run.generatedEntityType, run.generatedEntityId)}
                              className={textNavLinkClassName}
                            >
                              {t('detail.openEntity')}
                            </Link>
                          ) : (
                            t('fields.none')
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MainAppTableShell>
            }
            renderMobileCard={(run) =>
              run.generatedEntityId ? (
                <Link
                  href={generatedEntityPath(run.generatedEntityType, run.generatedEntityId)}
                  className={pressableCardLinkClassName}
                >
                  <p className="font-medium">{t('detail.openEntity')}</p>
                  <p className="mt-1 text-sm" dir="ltr">
                    {formatBusinessDate(run.runDate, locale)}
                    {run.occurrenceYearMonth ? ` · ${run.occurrenceYearMonth}` : ''}
                  </p>
                  {runStatusById[run.id] ? (
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {runStatusById[run.id]}
                    </p>
                  ) : null}
                </Link>
              ) : (
                <div className="rounded-lg border border-[var(--pf-border-default)] p-3">
                  <p className="text-sm" dir="ltr">
                    {formatBusinessDate(run.runDate, locale)}
                    {run.occurrenceYearMonth ? ` · ${run.occurrenceYearMonth}` : ''}
                  </p>
                  {runStatusById[run.id] ? (
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {runStatusById[run.id]}
                    </p>
                  ) : null}
                </div>
              )
            }
          />
        )}
      </MainAppSection>
    </MainAppPage>
  );
}
