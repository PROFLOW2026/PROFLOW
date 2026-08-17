import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getBillingRecord } from '@/modules/billing';
import { BillingDetailActions } from '@/modules/billing/ui/billing-detail-actions';
import { BillingStatusBadge } from '@/modules/billing/ui/billing-status-badge';
import {
  releaseBillingRetentionAction,
  updateBillingRetentionAction,
} from '@/modules/billing/ui/actions';
import { listBillingRetentionReleases } from '@/modules/retention';
import { RetentionPanel } from '@/modules/retention/ui/retention-panel';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { notFound } from 'next/navigation';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; billingRecordId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('detail.title') };
}

export default async function BillingDetailPage({
  params,
}: {
  params: Promise<{ locale: string; billingRecordId: string }>;
}) {
  const { locale, billingRecordId } = await params;
  const t = await getTranslations('billing');
  const tStatus = await getTranslations('status.billing');
  const tKind = await getTranslations('billing.kinds');
  const tPayment = await getTranslations('status.payment');

  let record;
  let canManage = false;
  let documentsPanel: Awaited<ReturnType<typeof getEntityDocumentPanelData>> | null = null;
  let retentionReleases: Awaited<ReturnType<typeof listBillingRetentionReleases>> = [];
  let orgToday = '';

  try {
    const result = await withOrgContext(async (context) => ({
      record: await getBillingRecord(context, billingRecordId),
      canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
      documentsPanel: await getEntityDocumentPanelData(context, 'billing_record', billingRecordId),
      retentionReleases: await listBillingRetentionReleases(context, billingRecordId).catch(
        () => [],
      ),
      orgToday: todayInTimeZone(context.organization.timezone),
    }));
    record = result.record;
    canManage = result.canManage;
    documentsPanel = result.documentsPanel;
    retentionReleases = result.retentionReleases;
    orgToday = result.orgToday;
  } catch {
    notFound();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={record.reference ?? t('detail.title')}
        description={record.projectName ?? undefined}
        meta={
          <BillingStatusBadge status={record.status} collectionStatus={record.collectionStatus} />
        }
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            {canManage && record.status === 'finalized' ? (
              <Button asChild variant="secondary" className="max-w-full">
                <Link href={`/billing/payments/new?billingRecordId=${record.id}`}>
                  {t('detail.recordPayment')}
                </Link>
              </Button>
            ) : null}
            <PrepareMessageLink
              entityType="billing_record"
              entityId={record.id}
              projectId={record.projectId}
              clientId={record.clientId}
              subject={record.reference}
            />
            <BillingDetailActions
              billingRecordId={record.id}
              canManage={canManage}
              status={record.status}
              recordReference={record.reference}
              paymentActions={record.payments.map((payment) => ({
                paymentId: payment.id,
                status: payment.status,
                amount: payment.amount,
                paymentDate: payment.paymentDate,
              }))}
            />
          </div>
        }
      />
      <p className="text-xs text-[var(--pf-text-muted)]">{t('statutoryDisclosure')}</p>

      <RetentionPanel
        side="ar"
        sourceId={record.id}
        currency={record.totalAmount.currency}
        totalAmount={record.totalAmount.amount}
        retentionAmount={record.retentionAmount?.amount ?? '0'}
        retentionHeldRemaining={record.retentionHeldRemaining?.amount ?? '0'}
        payableOrReceivableNow={record.outstandingAmount.amount}
        canManage={canManage}
        canEditDraft={record.status === 'draft'}
        canRelease={record.status === 'finalized' && record.kind !== 'credit_note'}
        defaultReleaseDate={orgToday}
        releases={retentionReleases.map((row) => ({
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          releasedOn: row.releasedOn,
          notes: row.notes,
        }))}
        locale={locale}
        captureAction={updateBillingRetentionAction}
        releaseAction={releaseBillingRetentionAction}
      />

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm text-start">{t('list.amount')}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 text-start">
            <MoneyText value={record.totalAmount} className="text-lg font-semibold" />
            <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
              {t('detail.kind')}: {tKind(record.kind)}
            </p>
            {record.contractName ? (
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                {t('list.contract')}: {record.contractName}
              </p>
            ) : null}
            {record.kind === 'credit_note' ? (
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                {t('integrity.creditNoteReducesInvoiced')}
              </p>
            ) : null}
            {record.status === 'void' ? (
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                {t('integrity.voidExcluded')}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm text-start">{t('list.paid')}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 text-start">
            <MoneyText value={record.paidAmount} className="text-lg font-semibold" />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm text-start">{t('list.outstanding')}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 text-start">
            <MoneyText value={record.outstandingAmount} className="text-lg font-semibold" colorizeNegative />
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-sm text-start">{tStatus(record.status)}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 text-start text-sm text-[var(--pf-text-secondary)]">
            <p>
              {t('list.issueDate')}:{' '}
              <span dir="ltr">{formatBusinessDate(record.issueDate, locale)}</span>
            </p>
            {record.dueDate ? (
              <p>
                {t('detail.dueDate')}:{' '}
                <span dir="ltr">{formatBusinessDate(record.dueDate, locale)}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {record.notes ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-start">{t('detail.notes')}</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap break-words text-start text-sm">
            {record.notes}
          </CardContent>
        </Card>
      ) : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-start">{t('detail.paymentsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {record.payments.length === 0 ? (
            <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('detail.noPayments')}</p>
          ) : (
            <ResponsiveTable
              items={record.payments}
              getRowKey={(payment) => payment.id}
              desktop={
                <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('paymentForm.paymentDate')}</TableHead>
                        <TableHead numeric>{t('paymentForm.amount')}</TableHead>
                        <TableHead>{t('paymentForm.method')}</TableHead>
                        <TableHead>{t('paymentForm.reference')}</TableHead>
                        <TableHead>{t('list.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {record.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <span dir="ltr">{formatBusinessDate(payment.paymentDate, locale)}</span>
                          </TableCell>
                          <TableCell numeric>
                            <MoneyText value={payment.amount} />
                          </TableCell>
                          <TableCell className="max-w-[8rem] truncate">{payment.method ?? '-'}</TableCell>
                          <TableCell className="max-w-[8rem] truncate">{payment.reference ?? '-'}</TableCell>
                          <TableCell>
                            <span className="text-sm text-[var(--pf-text-secondary)]">
                              {tPayment(payment.status)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(payment) => (
                <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 font-semibold" dir="ltr">
                      {formatBusinessDate(payment.paymentDate, locale)}
                    </span>
                    <span className="shrink-0 text-sm text-[var(--pf-text-secondary)]">
                      {tPayment(payment.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    <MoneyText value={payment.amount} />
                  </p>
                  <p className="mt-1 truncate text-sm text-[var(--pf-text-secondary)]">
                    {payment.method ?? '-'}
                    {payment.reference ? ` · ${payment.reference}` : null}
                  </p>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      {documentsPanel ? (
        <DocumentAttachments
          ownerType="billing_record"
          ownerId={record.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      ) : null}
    </div>
  );
}
