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
  listBillingContractOptionsForOrg,
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
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface ProjectBillingPanelProps {
  projectId: string;
  contractId?: string | null;
}

export async function ProjectBillingPanel({ projectId, contractId }: ProjectBillingPanelProps) {
  const t = await getTranslations('billing');
  const tFinancial = await getTranslations('financial');
  const locale = await getLocale();

  const { position, records, unbilledChanges, canManage, payments, contracts } = await withOrgContext(
    async (context) => {
      const [positionResult, recordsResult, unbilledResult, paymentsResult, contractOptions] =
        await Promise.all([
          getProjectBillingPosition(context, projectId),
          listProjectBillingRecords(context, projectId, contractId),
          listUnbilledChangeOrders(context, projectId),
          listPaymentApplications(context, {
            projectId,
            limit: 25,
            includeVoided: true,
          }),
          listBillingContractOptionsForOrg(context, projectId),
        ]);
      return {
        position: positionResult,
        records: recordsResult,
        unbilledChanges: unbilledResult,
        canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
        payments: paymentsResult,
        contracts: contractOptions,
      };
    },
  );

  const selectedContractId = contractId ?? null;
  const newBillingHref = selectedContractId
    ? `/billing/new?projectId=${projectId}&contractId=${selectedContractId}`
    : `/billing/new?projectId=${projectId}`;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-xs text-[var(--pf-text-muted)]">{t('statutoryDisclosure')}</p>
      {contracts.length > 1 ? (
        <nav className="flex min-w-0 flex-wrap gap-2" aria-label={t('list.contract')}>
          <Link
            href={`/projects/${projectId}?tab=billing`}
            className={
              !selectedContractId
                ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
            }
          >
            {t('list.allContracts')}
          </Link>
          {contracts.map((contract) => {
            const href = `/projects/${projectId}?tab=billing&contractId=${contract.id}`;
            const selected = selectedContractId === contract.id;
            return (
              <Link
                key={contract.id}
                href={href}
                className={
                  selected
                    ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                    : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
                }
              >
                {contract.name ??
                  contract.contractNumber ??
                  (contract.isPrimary ? t('form.contractPrimary') : contract.id.slice(0, 8))}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-start">{t('panel.positionTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-3">
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('invoiced')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.invoiced} />
            </p>
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('paid')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.paid} />
            </p>
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{tFinancial('outstanding')}</p>
            <p className="text-lg font-semibold">
              <MoneyText value={position.outstanding} colorizeNegative />
            </p>
          </div>
          <p className="sm:col-span-3 text-start text-xs text-[var(--pf-text-secondary)]">
            {t('panel.integrityHint')}
          </p>
        </CardContent>
      </Card>

      {unbilledChanges.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-start">{t('panel.unbilledChangesTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {unbilledChanges.map((change) => (
                <li
                  key={change.id}
                  className="flex min-h-11 min-w-0 items-center justify-between gap-2 text-start"
                >
                  <span className="min-w-0 truncate" dir="ltr">
                    {change.reference ?? change.id.slice(0, 8)}
                  </span>
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
                <Link href={newBillingHref}>{t('panel.emptyAction')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-start">{t('panel.recordsTitle')}</CardTitle>
            {canManage ? (
              <Button asChild size="sm" variant="secondary" className="min-h-11 max-w-full md:min-h-8">
                <Link href={newBillingHref}>{t('panel.addBilling')}</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="min-w-0 px-0 pb-0 sm:px-0">
            <ResponsiveTable
              items={records}
              getRowKey={(record) => record.id}
              desktop={
                <div className="min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('list.issueDate')}</TableHead>
                        <TableHead>{t('list.kind')}</TableHead>
                        <TableHead>{t('list.contract')}</TableHead>
                        <TableHead numeric>{t('list.amount')}</TableHead>
                        <TableHead numeric>{t('list.outstanding')}</TableHead>
                        <TableHead>{t('list.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell>
                            <Link href={`/billing/${record.id}`} className={textNavLinkClassName}>
                              <span dir="ltr">{formatBusinessDate(record.issueDate, locale)}</span>
                            </Link>
                          </TableCell>
                          <TableCell>{t(`kinds.${record.kind}`)}</TableCell>
                          <TableCell className="max-w-[8rem] truncate">
                            {record.contractName ?? '-'}
                          </TableCell>
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
                </div>
              }
              renderMobileCard={(record) => (
                <Link
                  href={`/billing/${record.id}`}
                  className={cn(pressableCardLinkClassName, 'text-start')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                      {formatBusinessDate(record.issueDate, locale)}
                    </span>
                    <BillingStatusBadge
                      className="shrink-0"
                      status={record.status}
                      collectionStatus={record.collectionStatus}
                    />
                  </div>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {t(`kinds.${record.kind}`)}
                    {record.contractName ? ` · ${record.contractName}` : ''}
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
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-start">{t('paymentHistory.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-2 px-0 pb-0 sm:px-0">
            <p className="px-6 text-start text-xs text-[var(--pf-text-secondary)]">
              {t('paymentHistory.subtitle')}
            </p>
            <PaymentHistoryTable rows={payments} locale={locale} hideProject />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
