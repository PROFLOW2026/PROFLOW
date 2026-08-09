import { getLocale, getTranslations } from 'next-intl/server';
import { Receipt } from 'lucide-react';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getProjectBillingPosition,
  listProjectBillingRecords,
  listUnbilledChangeOrders,
  listPaymentApplications,
} from '@/modules/billing';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { BillingStatusBadge } from './billing-status-badge';
import { PaymentHistoryTable } from './payment-history-panel';

interface ProjectBillingPanelProps {
  projectId: string;
}

export async function ProjectBillingPanel({ projectId }: ProjectBillingPanelProps) {
  const t = await getTranslations('billing');
  const tFinancial = await getTranslations('financial');
  const locale = await getLocale();

  const { position, records, unbilledChanges, canManage, payments } = await withOrgContext(
    async (context) => ({
      position: await getProjectBillingPosition(context, projectId),
      records: await listProjectBillingRecords(context, projectId),
      unbilledChanges: await listUnbilledChangeOrders(context, projectId),
      canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
      payments: await listPaymentApplications(context, {
        projectId,
        limit: 25,
        includeVoided: true,
      }),
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('panel.positionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('invoiced')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.invoiced} />
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('paid')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.paid} />
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('outstanding')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.outstanding} colorizeNegative />
            </p>
          </div>
          <p className="sm:col-span-3 text-xs text-[var(--pf-text-secondary)]">
            {t('panel.integrityHint')}
          </p>
        </CardContent>
      </Card>

      {unbilledChanges.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('panel.unbilledChangesTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {unbilledChanges.map((change) => (
                <li key={change.id} className="flex min-h-11 items-center justify-between gap-2">
                  <span>{change.reference ?? change.id.slice(0, 8)}</span>
                  <MoneyText value={change.amount} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('panel.emptyTitle')}
          description={t('panel.emptyBody')}
          action={
            canManage ? (
              <Button asChild>
                <Link href={`/billing/new?projectId=${projectId}`}>{t('panel.emptyAction')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle>{t('panel.recordsTitle')}</CardTitle>
            {canManage ? (
              <Button asChild size="sm" variant="secondary" className="min-h-11 md:min-h-8">
                <Link href={`/billing/new?projectId=${projectId}`}>{t('panel.addBilling')}</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0 sm:px-0">
            <ResponsiveTable
              items={records}
              getRowKey={(record) => record.id}
              desktop={
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('list.issueDate')}</TableHead>
                      <TableHead>{t('list.kind')}</TableHead>
                      <TableHead numeric>{t('list.amount')}</TableHead>
                      <TableHead numeric>{t('list.outstanding')}</TableHead>
                      <TableHead>{t('list.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Link href={`/billing/${record.id}`} className="text-[var(--pf-text-brand)]">
                            <span dir="ltr">{formatBusinessDate(record.issueDate, locale)}</span>
                          </Link>
                        </TableCell>
                        <TableCell>{t(`kinds.${record.kind}`)}</TableCell>
                        <TableCell numeric>
                          <MoneyText value={record.totalAmount} />
                        </TableCell>
                        <TableCell numeric>
                          <MoneyText value={record.outstandingAmount} colorizeNegative />
                        </TableCell>
                        <TableCell>
                          <BillingStatusBadge
                            status={record.status}
                            collectionStatus={record.collectionStatus}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              renderMobileCard={(record) => (
                <Link
                  href={`/billing/${record.id}`}
                  className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold" dir="ltr">
                      {formatBusinessDate(record.issueDate, locale)}
                    </span>
                    <BillingStatusBadge
                      status={record.status}
                      collectionStatus={record.collectionStatus}
                    />
                  </div>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {t(`kinds.${record.kind}`)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span>
                      {t('list.amount')}: <MoneyText value={record.totalAmount} />
                    </span>
                    <span>
                      {t('list.outstanding')}:{' '}
                      <MoneyText value={record.outstandingAmount} colorizeNegative />
                    </span>
                  </div>
                </Link>
              )}
              mobileListClassName="px-4 pb-4"
            />
          </CardContent>
        </Card>
      )}

      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('paymentHistory.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-0 pb-0 sm:px-0">
            <p className="px-6 text-xs text-[var(--pf-text-secondary)]">
              {t('paymentHistory.subtitle')}
            </p>
            <PaymentHistoryTable rows={payments} locale={locale} hideProject />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
