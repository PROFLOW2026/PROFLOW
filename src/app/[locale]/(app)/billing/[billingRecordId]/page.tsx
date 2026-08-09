import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getBillingRecord } from '@/modules/billing';
import { BillingDetailActions } from '@/modules/billing/ui/billing-detail-actions';
import { BillingStatusBadge } from '@/modules/billing/ui/billing-status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { notFound } from 'next/navigation';

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

  try {
    const result = await withOrgContext(async (context) => ({
      record: await getBillingRecord(context, billingRecordId),
      canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
      documentsPanel: await getEntityDocumentPanelData(context, 'billing_record', billingRecordId),
    }));
    record = result.record;
    canManage = result.canManage;
    documentsPanel = result.documentsPanel;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={record.reference ?? t('detail.title')}
        description={record.projectName ?? undefined}
        meta={
          <BillingStatusBadge status={record.status} collectionStatus={record.collectionStatus} />
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && record.status === 'finalized' ? (
              <Button asChild variant="secondary">
                <Link href={`/billing/payments/new?billingRecordId=${record.id}`}>
                  {t('detail.recordPayment')}
                </Link>
              </Button>
            ) : null}
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('list.amount')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyText value={record.totalAmount} className="text-lg font-semibold" />
            <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
              {t('detail.kind')}: {tKind(record.kind)}
            </p>
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('list.paid')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyText value={record.paidAmount} className="text-lg font-semibold" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('list.outstanding')}</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyText value={record.outstandingAmount} className="text-lg font-semibold" colorizeNegative />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tStatus(record.status)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--pf-text-secondary)]">
            <p>
              {t('list.issueDate')}: {formatBusinessDate(record.issueDate, locale)}
            </p>
            {record.dueDate ? (
              <p>
                {t('detail.dueDate')}: {formatBusinessDate(record.dueDate, locale)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {record.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('detail.notes')}</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{record.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.paymentsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {record.payments.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noPayments')}</p>
          ) : (
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
                    <TableCell>{formatBusinessDate(payment.paymentDate, locale)}</TableCell>
                    <TableCell numeric>
                      <MoneyText value={payment.amount} />
                    </TableCell>
                    <TableCell>{payment.method ?? '—'}</TableCell>
                    <TableCell>{payment.reference ?? '—'}</TableCell>
                    <TableCell>
                      <span className="text-sm text-[var(--pf-text-secondary)]">
                        {tPayment(payment.status)}
                      </span>
                    </TableCell>                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
