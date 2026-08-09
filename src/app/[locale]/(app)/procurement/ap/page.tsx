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
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../procurement-section-nav';

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

export default async function ApBillsPage() {
  const t = await getTranslations('ap');
  const locale = await getLocale();

  const { bills, canManage, canRead } = await withOrgContext(async (context) => ({
    bills: hasPermission(context, PERMISSIONS.AP_READ)
      ? await listApBillsForOrg(context)
      : [],
    canManage: hasPermission(context, PERMISSIONS.AP_MANAGE),
    canRead: hasPermission(context, PERMISSIONS.AP_READ),
  }));

  if (!canRead) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <ProcurementSectionNav active="ap" />
        <EmptyState title={t('empty.noAccess.title')} description={t('empty.noAccess.body')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/procurement/ap/new">
                <Plus aria-hidden />
                {t('newBill')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ProcurementSectionNav active="ap" />

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
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.reference')}</TableHead>
                    <TableHead>{t('list.columns.vendor')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead numeric>{t('list.columns.total')}</TableHead>
                    <TableHead>{t('list.columns.billDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/procurement/ap/${bill.id}`}
                          className="text-[var(--pf-text-brand)] hover:underline"
                        >
                          {bill.reference?.trim() || t('list.noReference')}
                        </Link>
                      </TableCell>
                      <TableCell>{bill.vendorName ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={billStatusShape(bill.status)}
                          label={t(`statuses.${bill.status}` as 'statuses.open')}
                        />
                      </TableCell>
                      <TableCell numeric>
                        <MoneyText value={money(bill.totalAmount, bill.currency)} />
                      </TableCell>
                      <TableCell>
                        {bill.billDate
                          ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                              new Date(bill.billDate),
                            )
                          : '—'}
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
              className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">
                  {bill.reference?.trim() || t('list.noReference')}
                </span>
                <StatusBadge
                  shape={billStatusShape(bill.status)}
                  label={t(`statuses.${bill.status}` as 'statuses.open')}
                />
              </div>
              <p className="text-sm text-[var(--pf-text-secondary)]">{bill.vendorName}</p>
              <MoneyText value={money(bill.totalAmount, bill.currency)} />
            </Link>
          )}
        />
      )}
    </div>
  );
}
