import { Receipt, ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  listBillingRecords,
  listPaymentApplications,
  computeReceivablesAging,
  computeReceivablesSummary,
  matchesListFilter,
} from '@/modules/billing';
import { BillingListTable } from '@/modules/billing/ui/billing-list-table';
import { PaymentHistoryTable } from '@/modules/billing/ui/payment-history-panel';
import { ReceivablesAgingPanel } from '@/modules/billing/ui/receivables-aging-panel';
import { ReceivablesSummaryPanel } from '@/modules/billing/ui/receivables-summary-panel';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import type { BillingListFilter } from '@/modules/billing';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';
import { ReportsEntryLink } from '@/modules/financials/ui/reports-entry-link';
import { isZeroMoney } from '@/shared/money';

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
  searchParams: Promise<{ filter?: string; contractId?: string }>;
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

  function billingListHref(nextFilter: BillingListFilter, nextContractId?: string) {
    const params = new URLSearchParams();
    if (nextFilter !== 'all') params.set('filter', nextFilter);
    if (nextContractId) params.set('contractId', nextContractId);
    const qs = params.toString();
    return qs ? `/billing?${qs}` : '/billing';
  }

  // One org billing load feeds the list filter + AR summary + aging (was 3× listBillingRecords).
  const { canRead, records, canManage, summary, aging, payments, canReadReports, contractOptions } =
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
          canReadReports: false,
          contractOptions: [] as { id: string; name: string | null }[],
        };
      }

      const [allRecords, paymentRows] = await Promise.all([
        listBillingRecords(context, { filter: 'all', limit: 5_000 }),
        listPaymentApplications(context, { limit: 25, includeVoided: true }),
      ]);

      const asOf = todayInTimeZone(context.organization.timezone);
      const currency = context.organization.baseCurrency;
      const receivablesSummary = computeReceivablesSummary(allRecords, currency, asOf);
      const receivablesAging = computeReceivablesAging(
        allRecords.filter((record) => !isZeroMoney(record.outstandingAmount)),
        currency,
        asOf,
      );
      const listed = allRecords
        .filter((record) => matchesListFilter(filter, record.collectionStatus))
        .filter((record) => (contractId ? record.contractId === contractId : true))
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
        canReadReports: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
        contractOptions,
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

      {showSummary && summary ? <ReceivablesSummaryPanel summary={summary} /> : null}
      {showAging && aging ? <ReceivablesAgingPanel aging={aging} /> : null}

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
