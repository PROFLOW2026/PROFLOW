import { Receipt, ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MoneyText } from '@/components/patterns/money-text';
import {
  listBillingRecords,
  listPaymentApplications,
  listUnallocatedPayments,
  computeReceivablesAging,
  computeReceivablesSummary,
  matchesListFilter,
  sumUnallocatedReceiptAmounts,
} from '@/modules/billing';
import { BillingListTable } from '@/modules/billing/ui/billing-list-table';
import { PaymentHistoryTable } from '@/modules/billing/ui/payment-history-panel';
import { ReceivablesAgingPanel } from '@/modules/billing/ui/receivables-aging-panel';
import { ReceivablesSummaryPanel } from '@/modules/billing/ui/receivables-summary-panel';
import { UnallocatedReceiptsPanel } from '@/modules/billing/ui/unallocated-receipts-panel';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import type { BillingListFilter } from '@/modules/billing';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';
import { ReportsEntryLink } from '@/modules/financials/ui/reports-entry-link';
import { isZeroMoney, money, type MoneyValue } from '@/shared/money';
import { sumCollectionsInDateRange } from '@/modules/financials';
import type { UnallocatedPaymentRow } from '@/modules/billing/domain/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('title') };
}

const FILTERS: BillingListFilter[] = ['all', 'paid', 'outstanding', 'overdue'];

export default async function BillingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    filter?: string;
    contractId?: string;
    fromDate?: string;
    toDate?: string;
    paymentFrom?: string;
    paymentTo?: string;
  }>;
}) {
  const [{ locale }, search, t, tRecurring] = await Promise.all([
    params,
    searchParams,
    getTranslations('billing'),
    getTranslations('recurringDrafts').then((tr) => tr('navFromSource')),
  ]);
  const rawFilter = search.filter;
  const filter = (FILTERS.includes(rawFilter as BillingListFilter) ? rawFilter : 'all') as BillingListFilter;
  const contractId =
    typeof search.contractId === 'string' && search.contractId.length > 0 ? search.contractId : undefined;
  const fromDate = typeof search.fromDate === 'string' && search.fromDate ? search.fromDate : undefined;
  const toDate = typeof search.toDate === 'string' && search.toDate ? search.toDate : undefined;
  const paymentFrom =
    typeof search.paymentFrom === 'string' && search.paymentFrom ? search.paymentFrom : undefined;
  const paymentTo =
    typeof search.paymentTo === 'string' && search.paymentTo ? search.paymentTo : undefined;

  function billingListHref(nextFilter: BillingListFilter, nextContractId?: string) {
    const params = new URLSearchParams();
    if (nextFilter !== 'all') params.set('filter', nextFilter);
    if (nextContractId) params.set('contractId', nextContractId);
    const qs = params.toString();
    return qs ? `/billing?${qs}` : '/billing';
  }

  // One org billing load feeds the list filter + AR summary + aging (was 3× listBillingRecords).
  const {
    canRead,
    records,
    canManage,
    summary,
    aging,
    payments,
    unallocatedRows,
    canReadReports,
    contractOptions,
    collectionsInPeriod,
    unallocatedReceipts,
    today,
  } =
    await withOrgContext(
    async (context) => {
      const allowed = hasPermission(context, PERMISSIONS.BILLING_READ);
      if (!allowed) {
        return {
          canRead: false,
          records: [],
          canManage: false,
          summary: null,
          aging: null,
          payments: [],
          unallocatedRows: [] as UnallocatedPaymentRow[],
          canReadReports: false,
          contractOptions: [] as { id: string; name: string | null }[],
          collectionsInPeriod: null as null | MoneyValue,
          unallocatedReceipts: null as null | MoneyValue,
          orgCurrency: context.organization.baseCurrency ?? 'ILS',
          today: todayInTimeZone(context.organization.timezone),
        };
      }

      const asOf = todayInTimeZone(context.organization.timezone);
      const currency = context.organization.baseCurrency;

      const [allRecords, paymentRows, collectionsAmt, unallocatedRaw, unallocatedRows] =
        await Promise.all([
          listBillingRecords(context, { filter: 'all', limit: 5_000 }),
          listPaymentApplications(context, { limit: 25, includeVoided: true }),
          paymentFrom && paymentTo
            ? sumCollectionsInDateRange(
                context.db,
                context.organizationId,
                currency,
                businessDate(paymentFrom),
                businessDate(paymentTo),
              )
            : Promise.resolve(null),
          sumUnallocatedReceiptAmounts(context.db, context.organizationId, currency),
          listUnallocatedPayments(context, { limit: 25 }),
        ]);
      const receivablesSummary = computeReceivablesSummary(allRecords, currency, asOf);
      const receivablesAging = computeReceivablesAging(
        allRecords.filter((record) => !isZeroMoney(record.outstandingAmount)),
        currency,
        asOf,
      );
      const listed = allRecords
        .filter((record) => matchesListFilter(filter, record.collectionStatus))
        .filter((record) => (contractId ? record.contractId === contractId : true))
        .filter((record) => {
          if (fromDate && record.issueDate < fromDate) return false;
          if (toDate && record.issueDate > toDate) return false;
          return true;
        })
        .slice(0, 100);

      const contractOptions = [
        ...new Map(
          allRecords
            .filter((record) => record.contractId)
            .map((record) => [
              record.contractId!,
              {
                id: record.contractId!,
                name: record.contractName ?? null,
              },
            ]),
        ).values(),
      ];

      return {
        canRead: true,
        records: listed,
        canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
        summary: receivablesSummary,
        aging: receivablesAging,
        payments: paymentRows,
        unallocatedRows,
        canReadReports: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
        contractOptions,
        collectionsInPeriod: collectionsAmt,
        unallocatedReceipts: money(unallocatedRaw, currency),
        orgCurrency: currency,
        today: asOf,
      };
    },
  );

  if (!canRead) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <EmptyState
          icon={ShieldX}
          title={t('notAllowed.title')}
          description={t('notAllowed.body')}
          size="md"
        />
      </div>
    );
  }

  const showAging = aging && !isZeroMoney(aging.totalOutstanding);
  const showSummary =
    summary &&
    (!isZeroMoney(summary.totalOutstanding) ||
      summary.openCount > 0 ||
      summary.partialPaidCount > 0 ||
      summary.overdueCount > 0 ||
      records.length > 0);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            {canReadReports ? (
              <ReportsEntryLink section="cash">{t('reportsEntry')}</ReportsEntryLink>
            ) : null}
            <Button asChild variant="secondary" className="max-w-full">
              <Link href="/recurring-drafts?kind=billing_record">{tRecurring}</Link>
            </Button>
            {canManage ? (
              <>
                <Button asChild variant="secondary" className="max-w-full">
                  <Link href="/billing/payments/new">{t('paymentForm.title')}</Link>
                </Button>
                <Button asChild className="max-w-full">
                  <Link href="/billing/new">{t('panel.addBilling')}</Link>
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      <p className="text-xs text-[var(--pf-text-muted)]">{t('statutoryDisclosure')}</p>
      <CommercialDocsHub current="billing" />

      <form method="get" className="flex flex-col gap-3">
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        {contractId && <input type="hidden" name="contractId" value={contractId} />}
        <div>
          <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('list.issueDateHint')}</p>
          <DateRangeSelector
            today={today}
            defaultFrom={fromDate ?? ''}
            defaultTo={toDate ?? ''}
            fromName="fromDate"
            toName="toDate"
            labels={{
              from: t('list.issueDate'),
              to: t('list.issueDate'),
            }}
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('list.paymentDateHint')}</p>
          <DateRangeSelector
            today={today}
            defaultFrom={paymentFrom ?? ''}
            defaultTo={paymentTo ?? ''}
            fromName="paymentFrom"
            toName="paymentTo"
            labels={{
              from: t('list.paymentFrom'),
              to: t('list.paymentTo'),
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
          >
            {t('list.filterButton')}
          </button>
          {(fromDate ?? toDate ?? paymentFrom ?? paymentTo) ? (
            <a
              href={billingListHref(filter, contractId)}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-[var(--pf-text-secondary)] hover:underline"
            >
              {t('list.clearFilter')}
            </a>
          ) : null}
        </div>
      </form>

      {/* Collections summary for the selected period */}
      {collectionsInPeriod && parseFloat(collectionsInPeriod.amount) > 0 ? (
        <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm">
          <span className="font-medium">{t('list.collectedInPeriodLabel')} </span>
          <MoneyText value={collectionsInPeriod} />
          <span className="ml-2 text-[var(--pf-text-secondary)]">{t('list.collectedInPeriodHint')}</span>
        </div>
      ) : null}

      {showSummary && summary ? (
        <ReceivablesSummaryPanel summary={summary} unallocatedReceipts={unallocatedReceipts} />
      ) : null}
      {showAging && aging ? <ReceivablesAgingPanel aging={aging} /> : null}

      <UnallocatedReceiptsPanel
        rows={unallocatedRows}
        locale={locale}
        canManage={canManage}
      />

      {contractOptions.length > 1 ? (
        <nav className="flex min-w-0 flex-wrap gap-2" aria-label={t('list.contract')}>
          <Link
            href={billingListHref(filter)}
            className={
              !contractId
                ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
            }
          >
            {t('list.allContracts')}
          </Link>
          {contractOptions.map((contract) => (
            <Link
              key={contract.id}
              href={billingListHref(filter, contract.id)}
              className={
                contractId === contract.id
                  ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                  : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
              }
            >
              {contract.name ?? contract.id.slice(0, 8)}
            </Link>
          ))}
        </nav>
      ) : null}

      <Tabs value={filter} className="min-w-0">
        <TabsList aria-label={t('list.filtersLabel')} className="min-w-0 max-w-full">
          {FILTERS.map((value) => (
            <TabsTrigger key={value} value={value} asChild className="min-h-11">
              <Link href={billingListHref(value, contractId)}>{t(`list.filters.${value}`)}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter} className="mt-4 min-w-0">
          {records.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={t('list.emptyTitle')}
              description={t('list.emptyBody')}
              action={
                canManage ? (
                  <Button asChild>
                    <Link href="/billing/new">{t('list.emptyAction')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <BillingListTable records={records} locale={locale} />
          )}
        </TabsContent>
      </Tabs>

      {payments.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">{t('paymentHistory.title')}</h2>
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
              {t('paymentHistory.subtitle')}
            </p>
          </div>
          <PaymentHistoryTable rows={payments} locale={locale} />
        </section>
      ) : null}
    </div>
  );
}
