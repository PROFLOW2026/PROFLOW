import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import {
  getPurchaseOrderById,
  isPurchaseOrderCancellable,
  isPurchaseOrderCloseable,
  isPurchaseOrderReceivable,
  type PurchaseOrderStatus,
} from '@/modules/procurement';
import { todayInTimeZone } from '@/shared/dates';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { CancelPurchaseOrderButton, ClosePurchaseOrderButton } from '../po-lifecycle-buttons';
import { PurchaseOrderReceiveForm } from './po-receive-form';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('detail.title') };
}

function orderStatusShape(status: string): StatusShape {
  switch (status as PurchaseOrderStatus) {
    case 'draft':
      return 'draft';
    case 'issued':
      return 'active';
    case 'partially_received':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ purchaseOrderId: string }>;
}) {
  const { purchaseOrderId } = await params;
  const t = await getTranslations('procurement');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) return null;
    try {
      const detail = await getPurchaseOrderById(context, purchaseOrderId);
      const documentsPanel = await getEntityDocumentPanelData(
        context,
        'purchase_order',
        purchaseOrderId,
      );
      return {
        ...detail,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.PROCUREMENT_MANAGE),
        canReadAp: hasPermission(context, PERMISSIONS.AP_MANAGE),
        defaultReceivedOn: todayInTimeZone(context.organization.timezone),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const { order, lines, receipts, fullyReceived, documentsPanel, canManage, canReadAp, defaultReceivedOn } = data;
  const status = order.status as PurchaseOrderStatus;
  const showCancel = canManage && isPurchaseOrderCancellable(status);
  const showClose = canManage && isPurchaseOrderCloseable(status);
  const showReceive = canManage && isPurchaseOrderReceivable(status) && !fullyReceived;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={order.reference?.trim() || t('list.noReference')}
        description={t('detail.description')}
        breadcrumb={
          <Link
            href="/procurement"
            className={textNavLinkMutedClassName}
          >
            {t('title')}
          </Link>
        }
        meta={
          <StatusBadge
            shape={orderStatusShape(order.status)}
            label={t(`statuses.${order.status}` as 'statuses.draft')}
          />
        }
        actions={
          <PrepareMessageLink
            entityType="purchase_order"
            entityId={order.id}
            vendorId={order.vendorId}
            subject={order.reference}
          />
        }
      />

      {fullyReceived && isPurchaseOrderReceivable(status) ? (
        <Alert tone="info">{t('receive.fullyReceivedHint')}</Alert>
      ) : null}

      <div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.committed')}</p>
          <MoneyText value={money(order.committedAmount, order.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('list.columns.actions')}</p>
          <p dir="ltr">{lines.length}</p>
        </div>
      </div>

      {showCancel || showClose ? (
        <div className="flex flex-wrap gap-2">
          {showClose ? <ClosePurchaseOrderButton purchaseOrderId={order.id} /> : null}
          {showCancel ? <CancelPurchaseOrderButton purchaseOrderId={order.id} /> : null}
        </div>
      ) : null}

      {canReadAp && status !== 'draft' && status !== 'cancelled' ? (
        <p className="text-sm">
          <Link href={`/procurement/ap/new?purchaseOrderId=${order.id}`} className={textNavLinkClassName}>
            {t('detail.createVendorBill')}
          </Link>
        </p>
      ) : null}

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('detail.linesTitle')}</h2>
        {lines.map((line) => (
          <div
            key={line.id}
            className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
          >
            <p className="font-medium text-[var(--pf-text-primary)]">{line.description}</p>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('receive.ordered')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.quantity}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('receive.received')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.receivedQuantity}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--pf-text-muted)]">{t('receive.remaining')}</span>
              <span className="pf-numeric pf-ltr-island" dir="ltr">
                {line.remainingQuantity}
              </span>
            </div>
          </div>
        ))}
      </section>

      {showReceive ? (
        <PurchaseOrderReceiveForm
          purchaseOrderId={order.id}
          defaultReceivedOn={defaultReceivedOn}
          lines={lines}
        />
      ) : null}

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('receive.receiptsTitle')}</h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('receive.emptyReceipts')}</p>
        ) : (
          receipts.map((receipt) => (
            <div
              key={receipt.id}
              className="flex flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[var(--pf-text-muted)]">{t('receive.receivedOn')}</span>
                <span className="pf-ltr-island" dir="ltr">
                  {receipt.receivedOn}
                </span>
              </div>
              {receipt.reference ? (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--pf-text-muted)]">{t('receive.reference')}</span>
                  <span>{receipt.reference}</span>
                </div>
              ) : null}
              {receipt.receivedByDisplayName ? (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--pf-text-muted)]">{t('receive.receivedBy')}</span>
                  <span>{receipt.receivedByDisplayName}</span>
                </div>
              ) : null}
              {receipt.notes ? <p>{receipt.notes}</p> : null}
              {receipt.lines.map((line) => (
                <div key={line.id} className="flex items-baseline justify-between gap-2">
                  <span className="text-[var(--pf-text-muted)]">{t('receive.quantity')}</span>
                  <span className="pf-numeric pf-ltr-island" dir="ltr">
                    {line.quantity}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <DocumentAttachments
        ownerType="purchase_order"
        ownerId={order.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
