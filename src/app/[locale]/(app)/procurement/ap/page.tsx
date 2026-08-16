import { FileSpreadsheet, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listApBillsForOrg, type ApBillStatus } from '@/modules/ap';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../procurement-section-nav';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { ReportsEntryLink } from '@/modules/financials/ui/reports-entry-link';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import { ApBillTaxSummary } from '@/modules/ap/ui/ap-bill-tax-summary';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('title') };
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

export default async function ApBillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('ap');
  const tRecurring = await getTranslations('recurringDrafts');
  const locale = await getLocale();
  const params = await searchParams;

  const { bills, canManage, canRead, canReadReports } = await withOrgContext(async (context) => ({
    bills: hasPermission(context, PERMISSIONS.AP_READ)
      ? await listApBillsForOrg(context)
      : [],
    canManage: hasPermission(context, PERMISSIONS.AP_MANAGE),
    canRead: hasPermission(context, PERMISSIONS.AP_READ),
    canReadReports: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
  }));

  if (!canRead) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <ProcurementSectionNav active="ap" />
        <EmptyState title={t('empty.noAccess.title')} description={t('empty.noAccess.body')} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
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
              <Link href="/procurement/ap/credits">{t('credits.navLink')}</Link>
            </Button>
            <Button asChild variant="secondary" className="max-w-full">
              <Link href="/procurement/ap/aging">{t('aging.navLink')}</Link>
            </Button>
            {canManage ? <OcrEntryLink workflow="vendor_bill" /> : null}
            {canManage ? (
              <Button asChild className="max-w-full">
                <Link href="/procurement/ap/new">
                  <Plus aria-hidden />
                  {t('newBill')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <ProcurementSectionNav active="ap" />
      <SavedListViewsBar listKey="ap_bills" searchParams={params} />

      {bills.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={t('empty.bills.title')}
          description={t('empty.bills.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/procurement/ap/new">{t('empty.bills.action')}</Link>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="max-w-[12rem] truncate font-medium">
                        <Link
                          href={`/procurement/ap/${bill.id}`}
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
                            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(bill.billDate),
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
              href={`/procurement/ap/${bill.id}`}
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
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(bill.billDate),
                  )}
                </p>
              ) : null}
            </Link>
          )}
        />
      )}
    </div>
  );
}
