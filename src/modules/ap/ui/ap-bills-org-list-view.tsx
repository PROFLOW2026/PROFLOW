import { FileSpreadsheet, Plus } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QueryPagination } from '@/components/ui/query-pagination';
import {
  countApBillsForOrg,
  getOrganizationApPayables,
  listApBillsForOrg,
  sumApPaymentsMadeInDateRange,
  type ApBillStatus,
} from '@/modules/ap';
import {
  ORG_LIST_PAGE_SIZE,
  orgListOffset,
  orgListPageCount,
  parseOrgListPage,
  resolveOrgListPage,
} from '@/shared/db/org-list-pagination';
import { isPositiveMoney, money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { ReportsEntryLink } from '@/modules/financials/ui/reports-entry-link';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { ApBillTaxSummary } from '@/modules/ap/ui/ap-bill-tax-summary';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { ProcurementSectionNav } from '@/modules/procurement/ui/procurement-section-nav';

export interface ApBillsOrgListViewProps {
  readonly routeBase: string;
  readonly surface: OrgListSurface;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function billStatusShape(status: string): StatusShape {
  switch (status as ApBillStatus) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'active';
    case 'partially_matched':
      return 'pending';
    case 'matched':
      return 'completed';
    case 'void':
      return 'cancelled';
    default:
      return 'archived';
  }
}

function billDetailHref(routeBase: string, billId: string): string {
  return `${routeBase}/${billId}`;
}

export async function ApBillsOrgListView({
  routeBase,
  surface,
  searchParams,
}: ApBillsOrgListViewProps) {
  const [t, tCommon, tRecurring, locale, params] = await Promise.all([
    getTranslations('ap'),
    getTranslations('common'),
    getTranslations('recurringDrafts'),
    getLocale(),
    searchParams,
  ]);

  const isOwner = surface === 'owner';
  const fromDate = typeof params.fromDate === 'string' && params.fromDate ? params.fromDate : undefined;
  const toDate = typeof params.toDate === 'string' && params.toDate ? params.toDate : undefined;
  const paymentFrom =
    typeof params.paymentFrom === 'string' && params.paymentFrom ? params.paymentFrom : undefined;
  const paymentTo = typeof params.paymentTo === 'string' && params.paymentTo ? params.paymentTo : undefined;
  const requestedPage = parseOrgListPage(
    typeof params.page === 'string' ? params.page : undefined,
  );
  const outstandingOnly =
    params.outstanding === '1' ||
    params.outstanding === 'true' ||
    params.status === 'open';

  const { bills, canManage, canRead, canReadReports, today, paidInPeriod, currency, totalCount, currentPage, totalPages } =
    await withOrgContext(async (context) => {
      const orgCurrency = context.organization.baseCurrency ?? 'ILS';
      const canReadAp = orgListHasPermission(context, PERMISSIONS.AP_READ, surface);
      const outstandingBillIds = canReadAp && outstandingOnly
        ? (await getOrganizationApPayables(context, { currency: orgCurrency })).bills
            .filter((bill) => isPositiveMoney(money(bill.outstanding, bill.currency)))
            .map((bill) => bill.billId)
        : undefined;
      const billListFilters = {
        fromDate,
        toDate,
        billIds: outstandingBillIds,
      };
      const paidAmount =
        canReadAp && paymentFrom && paymentTo
          ? await sumApPaymentsMadeInDateRange(
              context.db,
              context.organizationId,
              orgCurrency,
              paymentFrom as BusinessDate,
              paymentTo as BusinessDate,
            )
          : null;
      const total = canReadAp ? await countApBillsForOrg(context, billListFilters) : 0;
      const page = resolveOrgListPage(total, requestedPage);
      return {
        bills: canReadAp
          ? await listApBillsForOrg(context, {
              ...billListFilters,
              limit: ORG_LIST_PAGE_SIZE,
              offset: orgListOffset(page),
            })
          : [],
        canManage: orgListHasPermission(context, PERMISSIONS.AP_MANAGE, surface),
        canRead: canReadAp,
        canReadReports: orgListHasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ, surface),
        today: todayInTimeZone(context.organization.timezone),
        paidInPeriod: paidAmount,
        currency: orgCurrency,
        totalCount: total,
        currentPage: page,
        totalPages: orgListPageCount(total),
      };
    });

  if (!canRead) {
    const tEmployee = surface === 'employee' ? await getTranslations('employeeApp.ap') : null;
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {isOwner ? <PageHeader title={t('title')} description={t('description')} /> : null}
        {isOwner ? <ProcurementSectionNav active="ap" /> : null}
        <EmptyState
          title={tEmployee?.('noAccess.title') ?? t('empty.noAccess.title')}
          description={tEmployee?.('noAccess.description') ?? t('empty.noAccess.body')}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {isOwner ? (
        <PageHeader
          title={t('title')}
          description={t('description')}
          actions={
            <div className="flex max-w-full flex-wrap gap-2">
              {canReadReports ? (
                <ReportsEntryLink section="cost">{t('reportsEntry')}</ReportsEntryLink>
              ) : null}
              <Button asChild variant="secondary" className="max-w-full">
                <Link href="/recurring-drafts?kind=vendor_bill">{tRecurring('navFromSource')}</Link>
              </Button>
              <Button asChild variant="secondary" className="max-w-full">
                <Link href={`${routeBase}/credits`}>{t('credits.navLink')}</Link>
              </Button>
              <Button asChild variant="secondary" className="max-w-full">
                <Link href={`${routeBase}/aging`}>{t('aging.navLink')}</Link>
              </Button>
              {canManage ? <OcrEntryLink workflow="vendor_bill" /> : null}
              {canManage ? (
                <Button asChild className="max-w-full">
                  <Link href={`${routeBase}/new`}>
                    <Plus aria-hidden />
                    {t('newBill')}
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        />
      ) : null}

      {isOwner ? <ProcurementSectionNav active="ap" /> : null}
      {isOwner ? (
        <SavedListViewsBar
          listKey="ap_bills"
          searchParams={params}
          keys={['fromDate', 'toDate', 'paymentFrom', 'paymentTo', 'outstanding', 'page']}
        />
      ) : null}

      {outstandingOnly ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.outstandingOnly')}</p>
      ) : null}

      <form method="get" className="flex flex-col gap-3">
        {outstandingOnly ? <input type="hidden" name="outstanding" value="1" /> : null}
        <div>
          <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('list.billDateHint')}</p>
          <DateRangeSelector
            today={today}
            defaultFrom={fromDate ?? ''}
            defaultTo={toDate ?? ''}
            fromName="fromDate"
            toName="toDate"
          />
        </div>
        <div>
          <p className="mb-1 text-xs text-[var(--pf-text-muted)]">{t('list.paidInPeriodHint')}</p>
          <DateRangeSelector
            today={today}
            defaultFrom={paymentFrom ?? ''}
            defaultTo={paymentTo ?? ''}
            fromName="paymentFrom"
            toName="paymentTo"
            labels={{
              from: t('list.paymentDateFrom'),
              to: t('list.paymentDateTo'),
            }}
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
          >
            {t('aging.apply')}
          </button>
          {(fromDate ?? toDate ?? paymentFrom ?? paymentTo ?? outstandingOnly) ? (
            <Link
              href={routeBase}
              className="inline-flex h-9 items-center rounded-md px-3 text-sm text-[var(--pf-text-secondary)] hover:underline"
            >
              {t('aging.clear')}
            </Link>
          ) : null}
        </div>
      </form>

      {paidInPeriod !== null && parseFloat(paidInPeriod) > 0 ? (
        <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-4 py-3 text-sm">
          <span className="font-medium">{t('list.paidInPeriodLabel')} </span>
          <MoneyText value={{ amount: paidInPeriod, currency }} />
          <span className="ml-2 text-[var(--pf-text-secondary)]">{t('list.paidInPeriodHint')}</span>
        </div>
      ) : null}

      {bills.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={t('empty.bills.title')}
          description={t('empty.bills.body')}
          action={
            isOwner && canManage ? (
              <Button asChild>
                <Link href={`${routeBase}/new`}>{t('empty.bills.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={bills}
          getRowKey={(bill) => bill.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.reference')}</TableHead>
                    <TableHead>{t('list.columns.vendor')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead numeric>{t('list.columns.net')}</TableHead>
                    <TableHead numeric>{t('list.columns.vat')}</TableHead>
                    <TableHead numeric>{t('list.columns.gross')}</TableHead>
                    <TableHead>{t('list.columns.billDate')}</TableHead>
                    <TableHead>{t('list.columns.dueDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        <Link
                          href={billDetailHref(routeBase, bill.id)}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {bill.reference?.trim() || t('list.noReference')}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">{bill.vendorName ?? '-'}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={billStatusShape(bill.status)}
                          label={t(`statuses.${bill.status}` as 'statuses.open')}
                        />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(bill.netAmount ?? bill.totalAmount, bill.currency)} />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(bill.taxAmount ?? '0', bill.currency)} />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(bill.grossAmount ?? bill.totalAmount, bill.currency)} />
                      </TableCell>
                      <TableCell>
                        {bill.billDate ? (
                          <span dir="ltr">
                            {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(bill.billDate),
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {bill.dueDate ? (
                          <span
                            dir="ltr"
                            className={
                              bill.dueDate < new Date().toISOString().slice(0, 10) &&
                              bill.status !== 'matched'
                                ? 'font-medium text-[var(--pf-status-danger-fg)]'
                                : ''
                            }
                          >
                            {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(bill.dueDate),
                            )}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(bill) => (
            <Link
              href={billDetailHref(routeBase, bill.id)}
              className="flex min-h-11 min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <span className="min-w-0 break-words font-semibold">
                  {bill.reference?.trim() || t('list.noReference')}
                </span>
                <StatusBadge
                  shape={billStatusShape(bill.status)}
                  label={t(`statuses.${bill.status}` as 'statuses.open')}
                />
              </div>
              <p className="break-words text-sm text-[var(--pf-text-secondary)]">
                {bill.vendorName ?? '-'}
              </p>
              <ApBillTaxSummary
                compact
                netAmount={bill.netAmount ?? bill.totalAmount}
                taxAmount={bill.taxAmount ?? '0'}
                grossAmount={bill.grossAmount ?? bill.totalAmount}
                currency={bill.currency}
                taxBasis={bill.taxBasis}
              />
              {bill.billDate ? (
                <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                  {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(bill.billDate),
                  )}
                </p>
              ) : null}
              {bill.dueDate ? (
                <p
                  className={
                    'text-xs ' +
                    (bill.dueDate < new Date().toISOString().slice(0, 10) &&
                    bill.status !== 'matched'
                      ? 'font-medium text-[var(--pf-status-danger-fg)]'
                      : 'text-[var(--pf-text-muted)]')
                  }
                  dir="ltr"
                >
                  {t('list.columns.dueDate')}:{' '}
                  {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(bill.dueDate),
                  )}
                </p>
              ) : null}
            </Link>
          )}
        />
      )}

      <QueryPagination
        basePath={routeBase}
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={ORG_LIST_PAGE_SIZE}
        currentParams={{
          fromDate,
          toDate,
          paymentFrom,
          paymentTo,
        }}
        previousLabel={tCommon('actions.previous')}
        nextLabel={tCommon('actions.next')}
        pageOfLabel={tCommon('pagination.pageOf', { page: currentPage, pageCount: totalPages })}
        navLabel={tCommon('pagination.navLabel')}
      />
    </div>
  );
}
